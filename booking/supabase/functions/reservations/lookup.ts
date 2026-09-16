import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { normalizePhone } from "../_shared/validation.ts";

// GET /reservations/lookup?phone=...&reservation_number=...
// 電話番号+予約番号の組み合わせを本人確認代わりにする(顧客アカウント制を採らないための簡易照会)。
export async function lookupReservation(
  url: URL,
  client: SupabaseClient,
  headers: HeadersInit,
): Promise<Response> {
  const phone = url.searchParams.get("phone");
  const reservationNumber = url.searchParams.get("reservation_number");

  if (!phone || !reservationNumber) {
    throw new ApiError("VALIDATION_ERROR", "phone と reservation_number を指定してください。");
  }

  const { data, error } = await client
    .from("reservations")
    .select(
      "reservation_number, status, time_range, price_at_booking, notes, menus(name), staff(name), customers!inner(phone)",
    )
    .eq("reservation_number", reservationNumber)
    .eq("customers.phone", normalizePhone(phone))
    .maybeSingle();

  if (error) {
    console.error("reservation lookup failed:", error);
    throw new ApiError("INTERNAL_ERROR", "予約情報の取得に失敗しました。");
  }
  if (!data) {
    throw new ApiError("NOT_FOUND", "該当する予約が見つかりません。電話番号と予約番号をご確認ください。");
  }

  return jsonResponse({ reservation: data }, { headers });
}
