// GET /staff — 顧客が指名予約時に選べる、稼働中スタッフの一覧を返す。認証不要。
//
// 「指名可能」の基準は role != 'assistant'(アシスタントはシフトを持たず単独で
// 指名予約を受け付けない運用のため)。将来スタッフが増えた場合も、
// staffテーブルに行を追加するだけでここに自動的に反映される(コード変更不要)。

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
      .from("staff")
      .select("id, name, role")
      .eq("is_active", true)
      .neq("role", "assistant")
      .order("display_order", { ascending: true });

    if (error) throw new ApiError("INTERNAL_ERROR", "スタッフ情報の取得に失敗しました。");

    return jsonResponse({ staff: data }, { headers });
  } catch (err) {
    return errorResponse(err, headers);
  }
});
