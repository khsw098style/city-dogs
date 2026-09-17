import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { normalizePhone, requireNonEmptyString } from "../_shared/validation.ts";

const ACTIVE_STATUSES = ["tentative", "confirmed", "in_service", "awaiting_checkout"];

// POST /reservations/:reservation_number/cancel  body: { phone: string }
// 顧客本人によるキャンセル。電話番号の一致を本人確認代わりにする。
//
// パスパラメータは内部UUID(id)ではなく reservation_number にしている。
// 顧客が手元に持っている情報は予約完了時に表示された reservation_number だけで、
// 内部idはどのレスポンス(作成・照会)にも一度も含めていないため、
// idベースのルートにすると実質キャンセル不能になる(実機テストで発覚し修正)。
export async function cancelReservation(
  reservationNumber: string,
  req: Request,
  client: SupabaseClient,
  headers: HeadersInit,
): Promise<Response> {
  const body = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  });
  const phone = requireNonEmptyString(body?.phone, "電話番号");

  // customersを埋め込みで取得すると、生成済みDB型が無い状態ではsupabase-jsが
  // to-one関係でも配列型として推論してしまい、プロパティアクセスの型が壊れる。
  // 2段階のクエリに分けて型の曖昧さを避ける(顧客数・アクセス数的にも問題にならない)。
  const { data: reservation, error } = await client
    .from("reservations")
    .select("id, status, customer_id")
    .eq("reservation_number", reservationNumber)
    .maybeSingle();

  if (error) {
    console.error("reservation fetch failed:", error);
    throw new ApiError("INTERNAL_ERROR", "予約情報の取得に失敗しました。");
  }
  if (!reservation) {
    throw new ApiError("NOT_FOUND", "予約が見つかりません。");
  }

  const { data: customer, error: customerErr } = await client
    .from("customers")
    .select("phone")
    .eq("id", reservation.customer_id)
    .single();

  if (customerErr || !customer) {
    console.error("customer fetch failed:", customerErr);
    throw new ApiError("INTERNAL_ERROR", "顧客情報の取得に失敗しました。");
  }
  if (customer.phone !== normalizePhone(phone)) {
    throw new ApiError("FORBIDDEN", "電話番号が一致しません。");
  }
  if (!ACTIVE_STATUSES.includes(reservation.status)) {
    throw new ApiError("INVALID_STATUS_TRANSITION", "この予約はすでにキャンセルまたは完了しています。");
  }

  // 上のチェックはUXのための早期判定に過ぎない。SELECTとUPDATEの間に別リクエスト
  // (例: 管理画面での会計完了)がstatusを変えている可能性があるため、UPDATE自体にも
  // status条件を付けて原子的に判定する(2026-09-17、コードレビューで発見・修正)。
  const { data: updated, error: updateErr } = await client
    .from("reservations")
    .update({ status: "cancelled_by_customer", cancel_reason: "顧客によるキャンセル(Web)" })
    .eq("id", reservation.id)
    .in("status", ACTIVE_STATUSES)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    console.error("reservation cancel failed:", updateErr);
    throw new ApiError("INTERNAL_ERROR", "キャンセル処理に失敗しました。");
  }
  if (!updated) {
    // 取得後に他の操作でstatusが変わっていた(競合)。
    throw new ApiError("INVALID_STATUS_TRANSITION", "この予約はすでにキャンセルまたは完了しています。");
  }

  return jsonResponse({ status: "cancelled_by_customer" }, { headers });
}
