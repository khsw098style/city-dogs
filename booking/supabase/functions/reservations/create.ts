import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { computeAvailability, jstDateOf } from "../_shared/availability.ts";
import { sendReservationConfirmationEmail } from "../_shared/reservationEmail.ts";
import { upsertCustomerByPhone } from "../_shared/customers.ts";
import { extractClientIp } from "../_shared/rateLimit.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import {
  isValidEmail,
  isValidJpMobilePhone,
  requireNonEmptyString,
} from "../_shared/validation.ts";

interface CreateReservationBody {
  customer?: { name?: string; name_kana?: string; phone?: string; email?: string };
  menu_id?: string;
  staff_id?: string;
  start_at?: string;
  notes?: string;
  turnstile_token?: string;
}

// POST /reservations
// api-design.md の「POST /reservations」節に定義した手順どおりに実装する:
// 入力バリデーション → サーバー側で空き枠を再計算 → 顧客をUPSERT → 予約INSERT → EXCLUDE制約違反(競合)をハンドリング
export async function createReservation(
  req: Request,
  client: SupabaseClient,
  headers: HeadersInit,
): Promise<Response> {
  const body = await parseJsonBody(req);

  const turnstileOk = await verifyTurnstile(body.turnstile_token, extractClientIp(req));
  if (!turnstileOk) {
    throw new ApiError("VALIDATION_ERROR", "ボット判定によりリクエストを処理できませんでした。ページを再読み込みしてもう一度お試しください。");
  }

  const name = requireNonEmptyString(body.customer?.name, "お名前");
  const phone = requireNonEmptyString(body.customer?.phone, "電話番号");
  if (!isValidJpMobilePhone(phone)) {
    throw new ApiError("VALIDATION_ERROR", "電話番号の形式が正しくありません(例: 090-1234-5678)。");
  }
  const email = requireNonEmptyString(body.customer?.email, "メールアドレス");
  if (!isValidEmail(email)) {
    throw new ApiError("VALIDATION_ERROR", "メールアドレスの形式が正しくありません。");
  }
  const menuId = requireNonEmptyString(body.menu_id, "メニュー");
  const startAtRaw = requireNonEmptyString(body.start_at, "予約日時");
  // 「指名なし」は2026-09-18に廃止。担当スタイリストの指定を必須にする。
  const staffId = requireNonEmptyString(body.staff_id, "担当スタイリスト");

  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) {
    throw new ApiError("VALIDATION_ERROR", "予約日時の形式が不正です。");
  }
  if (startAt.getTime() <= Date.now()) {
    throw new ApiError("VALIDATION_ERROR", "過去の日時は予約できません。");
  }

  const date = jstDateOf(startAt);

  // クライアントが提示した枠をそのまま信用せず、サーバー側で同じロジックを使って再計算する。
  const availability = await computeAvailability(client, { date, menuId, staffId });
  if (availability.closed) {
    throw new ApiError("SLOT_UNAVAILABLE", "その日は休業日です。");
  }

  const matchedSlot = availability.slots.find((slot) => slot.start_at === startAt.toISOString());
  if (!matchedSlot) {
    throw new ApiError("SLOT_UNAVAILABLE", "選択した時間は埋まりました。お手数ですが再度お選びください。");
  }

  const endAt = new Date(startAt.getTime() + availability.menu.duration_minutes * 60 * 1000);
  const customerId = await upsertCustomerByPhone(client, {
    name,
    nameKana: body.customer?.name_kana ?? null,
    phone,
    email,
  });

  const { data: reservation, error: insertErr } = await client
    .from("reservations")
    .insert({
      customer_id: customerId,
      staff_id: matchedSlot.staff_id,
      menu_id: menuId,
      time_range: `[${startAt.toISOString()},${endAt.toISOString()})`,
      status: "confirmed",
      source: "web",
      price_at_booking: availability.menu.price,
      notes: body.notes?.trim() || null,
    })
    .select("reservation_number, status, price_at_booking, manage_token")
    .single();

  if (insertErr) {
    // 23P01 = exclusion_violation。空き枠チェックとINSERTの間に他の予約が割り込んだ競合状態。
    if (insertErr.code === "23P01") {
      throw new ApiError("SLOT_UNAVAILABLE", "選択した時間は埋まりました。お手数ですが再度お選びください。");
    }
    console.error("reservation insert failed:", insertErr);
    throw new ApiError("INTERNAL_ERROR", "予約の登録に失敗しました。");
  }

  // メール送信は失敗しても予約自体は成立させる(sendEmail内部で例外を握りつぶす設計)。
  // awaitはするが、失敗してもここでは何もしない。
  await sendReservationConfirmationEmail(email, {
    reservationNumber: reservation.reservation_number,
    manageToken: reservation.manage_token,
    menuName: availability.menu.name,
    staffName: matchedSlot.staff_name,
    startAt,
    endAt,
    price: reservation.price_at_booking,
  });

  return jsonResponse(
    {
      reservation_number: reservation.reservation_number,
      status: reservation.status,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      staff_name: matchedSlot.staff_name,
      menu_id: menuId,
      price: reservation.price_at_booking,
    },
    { status: 201, headers },
  );
}

async function parseJsonBody(req: Request): Promise<CreateReservationBody> {
  try {
    return (await req.json()) as CreateReservationBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
