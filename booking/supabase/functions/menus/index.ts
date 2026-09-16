// GET /menus — 有効なメニュー一覧を返す(api-design.md参照)。認証不要。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    if (req.method !== "GET") {
      throw new ApiError("VALIDATION_ERROR", "GETのみ対応しています。");
    }

    const client = serviceClient();
    const { data, error } = await client
      .from("menus")
      .select("id, name, price, duration_minutes, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw new ApiError("INTERNAL_ERROR", "メニュー情報の取得に失敗しました。");

    return jsonResponse({ menus: data }, { headers });
  } catch (err) {
    return errorResponse(err, headers);
  }
});
