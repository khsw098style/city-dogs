// /admin/business-days 配下のルーティング(要ログイン)。月次の営業日・受付時間設定。
//   GET  /admin/business-days                -> listBusinessDays(date_from/date_to指定必須)
//   PUT  /admin/business-days/:date          -> upsertBusinessDay(1日分の設定を作成/更新)
//   POST /admin/business-days/generate-month -> generateMonth(未設定の日だけデフォルト値で一括生成)
//
// 実際のデプロイ先はSupabase Edge Functionsの仕様上 `admin-business-days` という
// 1つの関数名になる(admin-reservations等と同じ方式)。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireStaff } from "../_shared/auth.ts";
import { generateMonth, listBusinessDays, upsertBusinessDay } from "./days.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const client = serviceClient();
    await requireStaff(req, client);

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const anchor = segments.indexOf("admin-business-days");
    const subPath = anchor === -1 ? [] : segments.slice(anchor + 1);

    if (req.method === "GET" && subPath.length === 0) {
      return await listBusinessDays(url, client, headers);
    }

    if (req.method === "POST" && subPath.length === 1 && subPath[0] === "generate-month") {
      return await generateMonth(req, client, headers);
    }

    if (req.method === "PUT" && subPath.length === 1) {
      return await upsertBusinessDay(decodeURIComponent(subPath[0]), req, client, headers);
    }

    throw new ApiError("NOT_FOUND", "対応していないエンドポイントです。");
  } catch (err) {
    return errorResponse(err, headers);
  }
});
