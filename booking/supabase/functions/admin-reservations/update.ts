import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { computeSlotsForDuration, jstDateOf } from "../_shared/availability.ts";
import { parseTstzRange } from "../_shared/range.ts";
import { isValidUuid, requireNonEmptyString } from "../_shared/validation.ts";
import { resolveFinalPrice } from "../_shared/checkout.ts";

interface UpdateReservationBody {
  status?: string;
  cancel_reason?: string;
  staff_id?: string;
  start_at?: string;
  /** 実際の会計金額(円)。会計完了の予約のみ。ルールは _shared/checkout.ts。 */
  final_price?: unknown;
}

// api-design.md「予約ステータスの状態遷移」表そのもの。ここにない遷移はすべて拒否する。
const STATUS_TRANSITIONS: Record<string, string[]> = {
  tentative: ["confirmed", "declined", "cancelled_by_customer", "cancelled_by_salon", "auto_cancelled"],
  confirmed: ["in_service", "cancelled_by_customer", "cancelled_by_salon", "no_show"],
  in_service: ["awaiting_checkout"],
  awaiting_checkout: ["completed"],
  completed: [],
  declined: [],
  cancelled_by_customer: [],
  cancelled_by_salon: [],
  no_show: [],
  auto_cancelled: [],
};
const REASON_REQUIRED_STATUSES = new Set(["declined", "cancelled_by_salon", "no_show"]);

// PATCH /admin-reservations/:id
// ステータス変更、および/またはスタッフ・時間の変更(リスケジュール)を同エンドポイントで扱う。
// リスケジュール時は、新しい枠の空き確認をPOST /admin-reservations作成時と同じ空き枠計算
// (computeSlotsForDuration→generateSlots)に通す(クライアント入力を信用せずサーバー側で再検証する方針を踏襲)。
export async function updateReservation(
  id: string,
  req: Request,
  client: SupabaseClient,
  headers: HeadersInit,
): Promise<Response> {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定された予約が見つかりません。");
  const body = await parseJsonBody(req);

  const { data: current, error: fetchErr } = await client
    .from("reservations")
    .select("id, status, staff_id, menu_id, time_range")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new ApiError("INTERNAL_ERROR", "予約情報の取得に失敗しました。");
  if (!current) throw new ApiError("NOT_FOUND", "指定された予約が見つかりません。");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const isReschedule = body.staff_id !== undefined || body.start_at !== undefined;

  if (isReschedule) {
    const currentRange = parseTstzRange(current.time_range as unknown as string);
    const durationMs = currentRange.end.getTime() - currentRange.start.getTime();

    // 「指名なし」は2026-09-18に廃止。staff_idを明示した場合は必ず1名指定させ、
    // 指定しない場合は現在の担当を維持する(「担当を空にする」は未サポート)。
    const newStaffId = body.staff_id !== undefined
      ? requireNonEmptyString(body.staff_id, "担当スタイリスト")
      : (current.staff_id as string);
    const newStartAt = body.start_at !== undefined ? new Date(body.start_at) : currentRange.start;
    if (Number.isNaN(newStartAt.getTime())) {
      throw new ApiError("VALIDATION_ERROR", "予約日時の形式が不正です。");
    }
    if (newStartAt.getTime() <= Date.now()) {
      throw new ApiError("VALIDATION_ERROR", "過去の日時には変更できません。");
    }

    // 変更対象の予約自身を「既存予約との重なり」判定から除外しないと、変更前の時間帯が
    // 自分自身とぶつかって誤ってSLOT_UNAVAILABLEになる(同じ時間のままスタッフだけ変える場合など)。
    // 所要時間は予約時点の合計(現在のtime_rangeの長さ)をそのまま使う。メニュー(複数選択の
    // 内訳)を引き直さないので、予約後にメニューが非公開・改定されていても日時変更できる。
    const availability = await computeSlotsForDuration(client, {
      date: jstDateOf(newStartAt),
      durationMinutes: durationMs / 60000,
      staffId: newStaffId,
      excludeReservationId: id,
    });
    if (availability.closed) throw new ApiError("SLOT_UNAVAILABLE", "その日は休業日です。");

    const matchedSlot = availability.slots.find((slot) => slot.start_at === newStartAt.toISOString());
    if (!matchedSlot) throw new ApiError("SLOT_UNAVAILABLE", "変更先の時間はすでに埋まっています。");

    const newEndAt = new Date(newStartAt.getTime() + durationMs);
    patch.staff_id = matchedSlot.staff_id;
    patch.time_range = `[${newStartAt.toISOString()},${newEndAt.toISOString()})`;
  }

  if (body.status !== undefined) {
    const allowed = STATUS_TRANSITIONS[current.status as string] ?? [];
    if (!allowed.includes(body.status)) {
      throw new ApiError(
        "INVALID_STATUS_TRANSITION",
        `「${current.status}」から「${body.status}」への変更はできません。`,
      );
    }
    if (REASON_REQUIRED_STATUSES.has(body.status) && !body.cancel_reason?.trim()) {
      throw new ApiError("VALIDATION_ERROR", "この変更には理由の入力が必要です。");
    }
    patch.status = body.status;
    if (body.cancel_reason !== undefined) patch.cancel_reason = body.cancel_reason?.trim() || null;
  }

  // 実際の会計金額(2026-09-25〜)。「〜」付きメニューを含む予約を会計完了にする時は入力必須。
  // 「〜」付きかどうかの確認(DB問い合わせ)は、その判定が必要な「completedへの変更で金額未指定」の時だけ行う。
  let hasEstimatedPrice = false;
  if (body.status === "completed" && body.final_price === undefined) {
    const { data: fromItems, error: itemsErr } = await client
      .from("reservation_items")
      .select("id")
      .eq("reservation_id", id)
      .eq("price_is_from", true)
      .limit(1);
    if (itemsErr) throw new ApiError("INTERNAL_ERROR", "予約情報の取得に失敗しました。");
    hasEstimatedPrice = (fromItems ?? []).length > 0;
  }
  const finalPrice = resolveFinalPrice({
    currentStatus: current.status as string,
    newStatus: body.status,
    finalPrice: body.final_price,
    hasEstimatedPrice,
  });
  if (finalPrice !== undefined) patch.final_price = finalPrice;

  if (Object.keys(patch).length === 1) {
    // updated_atしか入っていない = statusもstaff_id/start_atも指定されていない
    throw new ApiError("VALIDATION_ERROR", "status、staff_id/start_at、final_price のいずれかを指定してください。");
  }

  // SELECTで読んだ時点のstatusを条件に付け、原子的に判定する(SELECTとUPDATEの間に
  // 別リクエスト(顧客によるキャンセル等)がstatusを変えている可能性があるため。
  // 2026-09-17、コードレビューで発見・修正)。直前のSELECTで存在確認済みのため、
  // ここで0件になるのは実質的に競合のみ(削除エンドポイントは存在しないため)。
  const { data: updated, error: updateErr } = await client
    .from("reservations")
    .update(patch)
    .eq("id", id)
    .eq("status", current.status as string)
    .select("id, reservation_number, status, staff_id, time_range, cancel_reason, final_price")
    .maybeSingle();

  if (updateErr) {
    if (updateErr.code === "23P01") {
      throw new ApiError("SLOT_UNAVAILABLE", "変更先の時間はすでに埋まっています。");
    }
    console.error("admin reservation update failed:", updateErr);
    throw new ApiError("INTERNAL_ERROR", "予約の更新に失敗しました。");
  }
  if (!updated) {
    throw new ApiError("INVALID_STATUS_TRANSITION", "予約の状態が変更されています。画面を更新してもう一度お試しください。");
  }

  const range = parseTstzRange(updated.time_range as unknown as string);
  return jsonResponse(
    {
      id: updated.id,
      reservation_number: updated.reservation_number,
      status: updated.status,
      staff_id: updated.staff_id,
      start_at: range.start.toISOString(),
      end_at: range.end.toISOString(),
      cancel_reason: updated.cancel_reason,
      final_price: updated.final_price,
    },
    { headers },
  );
}

async function parseJsonBody(req: Request): Promise<UpdateReservationBody> {
  try {
    return (await req.json()) as UpdateReservationBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
