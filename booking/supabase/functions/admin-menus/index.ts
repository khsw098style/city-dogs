// /admin/menus 配下のルーティング(要ログイン)。メニュー・料金編集用。
//   GET/POST     /admin/menus     -> listMenus / createMenu
//   PATCH/DELETE /admin/menus/:id -> updateMenu / deleteMenu(予約実績があるものは削除不可。menus.tsのコメント参照)
//
// 実際のデプロイ先はSupabase Edge Functionsの仕様上 `admin-menus` という1つの
// 関数名になる(admin-reservations/admin-site-contentと同じ方式)。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireStaff } from "../_shared/auth.ts";
import { createMenu, deleteMenu, listMenus, updateMenu } from "./menus.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const client = serviceClient();
    await requireStaff(req, client);

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const anchor = segments.indexOf("admin-menus");
    const subPath = anchor === -1 ? [] : segments.slice(anchor + 1);
    const [resourceId] = subPath;

    if (req.method === "GET" && !resourceId) return await listMenus(client, headers);
    if (req.method === "POST" && !resourceId) return await createMenu(req, client, headers);
    if (req.method === "PATCH" && resourceId) return await updateMenu(resourceId, req, client, headers);
    if (req.method === "DELETE" && resourceId) return await deleteMenu(resourceId, client, headers);

    throw new ApiError("NOT_FOUND", "対応していないエンドポイントです。");
  } catch (err) {
    return errorResponse(err, headers);
  }
});
