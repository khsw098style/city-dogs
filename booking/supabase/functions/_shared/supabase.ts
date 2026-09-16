import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY はSupabaseがEdge Functionに自動注入する環境変数。
// service_role キーはRLSをバイパスするため、テーブルへの直接アクセスはこのFunction層の
// バリデーション・空き枠再計算を必ず経由させること(design/api-design.mdの実装方針を参照)。
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません。");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
