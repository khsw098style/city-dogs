// /admin/customers 配下のルーティング(要ログイン)。お客様管理(no_show_count/is_blockedの更新等)。
//   GET   /admin/customers      -> listCustomers(電話番号/氏名で検索)
//   GET   /admin/customers/:id  -> getCustomer(詳細+直近の予約履歴)
//   PATCH /admin/customers/:id  -> updateCustomer
//
// 実際のデプロイ先はSupabase Edge Functionsの仕様上 `admin-customers` という
// 1つの関数名になる(admin-reservations等と同じ方式)。
// 顧客の削除は提供しない(reservations.customer_idが参照するため物理削除不可。
// また顧客は予約経由で自動作成される想定で、管理画面から手動で新規作成する導線もない)。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireStaff } from "../_shared/auth.ts";
import { getCustomer, listCustomers, updateCustomer } from "./customers.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const client = serviceClient();
    await requireStaff(req, client);

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const anchor = segments.indexOf("admin-customers");
    const subPath = anchor === -1 ? [] : segments.slice(anchor + 1);
    const [resourceId] = subPath;

    if (req.method === "GET" && !resourceId) return await listCustomers(url, client, headers);
    if (req.method === "GET" && resourceId) return await getCustomer(decodeURIComponent(resourceId), client, headers);
    if (req.method === "PATCH" && resourceId) return await updateCustomer(decodeURIComponent(resourceId), req, client, headers);

    throw new ApiError("NOT_FOUND", "対応していないエンドポイントです。");
  } catch (err) {
    return errorResponse(err, headers);
  }
});
