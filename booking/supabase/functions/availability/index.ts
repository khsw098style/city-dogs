// GET /availability?date=YYYY-MM-DD&menu_ids=id1,id2,...&staff_id=... — 空き枠一覧を返す。認証不要。
//   menu_ids: 選択したメニュー(主メニュー+追加メニュー)のIDをカンマ区切りで指定。所要時間は合計で計算する。
//             旧形式の menu_id=...(単一)も受け付ける(古いフロントエンドが残っている間の互換用)。
//   duration_minutes: menu_ids の代わりに所要時間(分)を直接指定できる。管理画面のリスケジュール用
//             (予約時点のメニューが後から非公開になっていても日時変更できるようにするため)。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { computeAvailability, computeSlotsForDuration } from "../_shared/availability.ts";
import { parseMenuIds } from "../_shared/menuSelection.ts";
import { isValidUuid } from "../_shared/validation.ts";

const MAX_DURATION_MINUTES = 600;

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
    const menuIds = parseMenuIds({
      menu_ids: url.searchParams.get("menu_ids") ?? undefined,
      menu_id: url.searchParams.get("menu_id") ?? undefined,
    });
    const durationParam = url.searchParams.get("duration_minutes");
    const staffId = url.searchParams.get("staff_id");
    const excludeReservationId = url.searchParams.get("exclude_reservation_id");

    if (!date) throw new ApiError("VALIDATION_ERROR", "date は必須です。");
    if (menuIds.length === 0 && !durationParam) {
      throw new ApiError("VALIDATION_ERROR", "menu_ids は必須です。");
    }
    // 「指名なし」は2026-09-18に廃止(同一時刻に複数スタッフの枠が重複して見える・
    // お客様が意図せずアシスタント等に割り当てられる、という設計上の問題があったため)。
    // staff_idは必須にし、担当スタイリストを常に1名確定させた状態でのみ空き枠を返す。
    if (!staffId) throw new ApiError("VALIDATION_ERROR", "staff_id は必須です。");
    if (!isValidUuid(staffId)) throw new ApiError("VALIDATION_ERROR", "staff_id の形式が不正です。");
    if (excludeReservationId && !isValidUuid(excludeReservationId)) {
      throw new ApiError("VALIDATION_ERROR", "exclude_reservation_id の形式が不正です。");
    }

    const client = serviceClient();

    if (menuIds.length === 0) {
      const durationMinutes = Number(durationParam);
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > MAX_DURATION_MINUTES) {
        throw new ApiError("VALIDATION_ERROR", `duration_minutes は1〜${MAX_DURATION_MINUTES}の整数で指定してください。`);
      }
      const result = await computeSlotsForDuration(client, {
        date,
        staffId,
        durationMinutes,
        excludeReservationId: excludeReservationId ?? undefined,
      });
      return jsonResponse(
        { date, menu: null, reason: result.closed ? "closed" : undefined, slots: result.slots },
        { headers },
      );
    }

    const result = await computeAvailability(client, {
      date,
      menuIds,
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
