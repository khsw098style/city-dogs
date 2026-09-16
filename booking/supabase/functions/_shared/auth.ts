import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";

export interface AdminContext {
  staffId: string;
  name: string;
  role: "owner" | "stylist" | "assistant";
}

// 管理API共通のログイン確認。Authorization: Bearer <Supabase AuthのJWT> を検証し、
// staff.auth_user_id に紐づくスタッフ本人であることを確認する。
export async function requireStaff(req: Request, client: SupabaseClient): Promise<AdminContext> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new ApiError("UNAUTHORIZED", "ログインが必要です。");
  }

  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData?.user) {
    throw new ApiError("UNAUTHORIZED", "セッションが無効です。再度ログインしてください。");
  }

  const { data: staff, error: staffErr } = await client
    .from("staff")
    .select("id, name, role, is_active")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (staffErr) {
    throw new ApiError("INTERNAL_ERROR", "スタッフ情報の取得に失敗しました。");
  }
  if (!staff || !staff.is_active) {
    throw new ApiError("FORBIDDEN", "スタッフアカウントとして登録されていません。");
  }

  return { staffId: staff.id, name: staff.name, role: staff.role };
}
