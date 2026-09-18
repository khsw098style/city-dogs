// GET /availability?date=YYYY-MM-DD&menu_id=...&staff_id=... — 空き枠一覧を返す。認証不要。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { computeAvailability } from "../_shared/availability.ts";
import { isValidUuid } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    if (req.method !== "GET") {
      throw new ApiError("VALIDATION_ERROR", "GETのみ対応しています。");
    }

    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const menuId = url.searchParams.get("menu_id");
    const staffId = url.searchParams.get("staff_id");
    const excludeReservationId = url.searchParams.get("exclude_reservation_id");

    if (!date) throw new ApiError("VALIDATION_ERROR", "date は必須です。");
    if (!menuId) throw new ApiError("VALIDATION_ERROR", "menu_id は必須です。");
    // 「指名なし」は2026-09-18に廃止(同一時刻に複数スタッフの枠が重複して見える・
    // お客様が意図せずアシスタント等に割り当てられる、という設計上の問題があったため)。
    // staff_idは必須にし、担当スタイリストを常に1名確定させた状態でのみ空き枠を返す。
    if (!staffId) throw new ApiError("VALIDATION_ERROR", "staff_id は必須です。");
    if (!isValidUuid(staffId)) throw new ApiError("VALIDATION_ERROR", "staff_id の形式が不正です。");
    if (excludeReservationId && !isValidUuid(excludeReservationId)) {
      throw new ApiError("VALIDATION_ERROR", "exclude_reservation_id の形式が不正です。");
    }

    const client = serviceClient();
    const result = await computeAvailability(client, {
      date,
      menuId,
      staffId,
      excludeReservationId: excludeReservationId ?? undefined,
    });

    return jsonResponse(
      {
        date,
        menu: result.menu,
        reason: result.closed ? "closed" : undefined,
        slots: result.slots,
      },
      { headers },
    );
  } catch (err) {
    return errorResponse(err, headers);
  }
});
