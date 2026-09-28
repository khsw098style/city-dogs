import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";

export type StaffRole = "owner" | "stylist" | "assistant" | "maintainer";

export interface AdminContext {
  staffId: string;
  name: string;
  role: StaffRole;
}

// 保守用アカウント(maintainer)は閲覧専用。管理APIの書き込み系メソッドを一括で拒否する。
// メソッドで判定するのは、今後管理APIに書き込みルートを足しても自動的に保護されるようにするため
// (ルートごとにチェックを書き忘れる事故を構造的に防ぐ)。
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertRoleCanUseMethod(role: StaffRole, method: string): void {
  if (role === "maintainer" && !READ_ONLY_METHODS.has(method.toUpperCase())) {
    throw new ApiError("FORBIDDEN", "保守用アカウントは閲覧専用のため、この操作はできません。");
  }
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

  assertRoleCanUseMethod(staff.role, req.method);

  return { staffId: staff.id, name: staff.name, role: staff.role };
}
