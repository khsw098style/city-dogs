import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { computeAvailability, jstDateOf } from "../_shared/availability.ts";
import { sendReservationConfirmationEmail } from "../_shared/reservationEmail.ts";
import { upsertCustomerByPhone } from "../_shared/customers.ts";
import { isValidEmail, isValidJpMobilePhone, requireNonEmptyString } from "../_shared/validation.ts";

interface CreateAdminReservationBody {
  customer?: { name?: string; name_kana?: string; phone?: string; email?: string };
  menu_id?: string;
  staff_id?: string;
  start_at?: string;
  notes?: string;
}

// POST /admin-reservations — 電話予約の代理登録。
// 公開の POST /reservations(reservations/create.ts)と空き枠再検証・EXCLUDE制約による
// 競合検知のロジックは共通(_shared/availability.ts, _shared/customers.ts)。差分は2点:
//   ① source='phone' で記録する
//   ② emailは任意。未入力ならメール送信自体をスキップする(fail-softという意味では公開APIと同じ)
// 電話番号のチェックは公開予約(reserve.js)と完全に同一仕様にする方針のため、
// 携帯限定のisValidJpMobilePhoneをそのまま使う(固定電話は不可。2026-09-14に決定)。
export async function createAdminReservation(
  req: Request,
  client: SupabaseClient,
  headers: HeadersInit,
): Promise<Response> {
  const body = await parseJsonBody(req);

  const name = requireNonEmptyString(body.customer?.name, "お名前");
  const phone = requireNonEmptyString(body.customer?.phone, "電話番号");
  if (!isValidJpMobilePhone(phone)) {
    throw new ApiError("VALIDATION_ERROR", "電話番号の形式が正しくありません(例: 090-1234-5678)。");
  }
  const emailRaw = body.customer?.email?.trim();
  if (emailRaw && !isValidEmail(emailRaw)) {
    throw new ApiError("VALIDATION_ERROR", "メールアドレスの形式が正しくありません。");
  }
  const email = emailRaw || null;

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

  const availability = await computeAvailability(client, { date, menuId, staffId });
  if (availability.closed) {
    throw new ApiError("SLOT_UNAVAILABLE", "その日は休業日です。");
  }
  const matchedSlot = availability.slots.find((slot) => slot.start_at === startAt.toISOString());
  if (!matchedSlot) {
    throw new ApiError("SLOT_UNAVAILABLE", "選択した時間はすでに埋まっています。");
  }

  const endAt = new Date(startAt.getTime() + availability.menu.duration_minutes * 60 * 1000);
  // スタッフが電話口で本人確認した上での代理登録なので、既存顧客の氏名・emailの
  // 上書きを許可する(公開予約側との違いは_shared/customers.tsのコメント参照)。
  const customerId = await upsertCustomerByPhone(client, {
    name,
    nameKana: body.customer?.name_kana ?? null,
    phone,
    email,
    allowOverwrite: true,
  });

  const { data: reservation, error: insertErr } = await client
    .from("reservations")
    .insert({
      customer_id: customerId,
      staff_id: matchedSlot.staff_id,
      menu_id: menuId,
      time_range: `[${startAt.toISOString()},${endAt.toISOString()})`,
      status: "confirmed",
      source: "phone",
      price_at_booking: availability.menu.price,
      notes: body.notes?.trim() || null,
    })
    .select("id, reservation_number, status, price_at_booking, manage_token")
    .single();

  if (insertErr) {
    // 23P01 = exclusion_violation。空き枠チェックとINSERTの間に他の予約が割り込んだ競合状態。
    if (insertErr.code === "23P01") {
      throw new ApiError("SLOT_UNAVAILABLE", "選択した時間はすでに埋まっています。");
    }
    console.error("admin reservation insert failed:", insertErr);
    throw new ApiError("INTERNAL_ERROR", "予約の登録に失敗しました。");
  }

  if (email) {
    await sendReservationConfirmationEmail(email, {
      reservationNumber: reservation.reservation_number,
      manageToken: reservation.manage_token,
      menuName: availability.menu.name,
      staffName: matchedSlot.staff_name,
      startAt,
      endAt,
      price: reservation.price_at_booking,
    });
  }

  return jsonResponse(
    {
      id: reservation.id,
      reservation_number: reservation.reservation_number,
      status: reservation.status,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      staff_id: matchedSlot.staff_id,
      staff_name: matchedSlot.staff_name,
      menu_id: menuId,
      menu_name: availability.menu.name,
      price: reservation.price_at_booking,
    },
    { status: 201, headers },
  );
}

async function parseJsonBody(req: Request): Promise<CreateAdminReservationBody> {
  try {
    return (await req.json()) as CreateAdminReservationBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
