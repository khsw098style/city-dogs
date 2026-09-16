// /admin/staff-shifts 配下のルーティング(要ログイン)。スタッフの月次シフト設定。
//   GET  /admin/staff-shifts                       -> listStaffShifts(date_from/date_to必須、staff_id任意)
//   PUT  /admin/staff-shifts/:staffId/:date        -> upsertStaffShift(1人・1日分の設定を作成/更新)
//   POST /admin/staff-shifts/generate-month        -> generateMonthShifts(営業日に合わせて一括生成)
//
// 実際のデプロイ先はSupabase Edge Functionsの仕様上 `admin-staff-shifts` という
// 1つの関数名になる(admin-reservations等と同じ方式)。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireStaff } from "../_shared/auth.ts";
import { generateMonthShifts, listStaffShifts, upsertStaffShift } from "./shifts.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const client = serviceClient();
    await requireStaff(req, client);

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const anchor = segments.indexOf("admin-staff-shifts");
    const subPath = anchor === -1 ? [] : segments.slice(anchor + 1);

    if (req.method === "GET" && subPath.length === 0) {
      return await listStaffShifts(url, client, headers);
    }

    if (req.method === "POST" && subPath.length === 1 && subPath[0] === "generate-month") {
      return await generateMonthShifts(req, client, headers);
    }

    if (req.method === "PUT" && subPath.length === 2) {
      return await upsertStaffShift(decodeURIComponent(subPath[0]), decodeURIComponent(subPath[1]), req, client, headers);
    }

    throw new ApiError("NOT_FOUND", "対応していないエンドポイントです。");
  } catch (err) {
    return errorResponse(err, headers);
  }
});
