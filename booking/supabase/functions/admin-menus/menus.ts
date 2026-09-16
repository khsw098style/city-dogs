import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { isValidUuid, requireNonEmptyString } from "../_shared/validation.ts";

interface MenuBody {
  name?: string;
  price?: number;
  duration_minutes?: number;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

const SELECT_COLUMNS = "id, name, price, duration_minutes, description, is_active, sort_order";

function requirePositiveInt(value: unknown, fieldName: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError("VALIDATION_ERROR", `${fieldName} は1以上の整数を指定してください。`);
  }
  return n;
}

// GET /admin-menus — 編集用に非公開(is_active=false)分も含めて全件返す。
// 公開用の GET /menus(is_active=trueのみ)とは別実装。
export async function listMenus(client: SupabaseClient, headers: HeadersInit) {
  const { data, error } = await client
    .from("menus")
    .select(SELECT_COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) throw new ApiError("INTERNAL_ERROR", "メニューの取得に失敗しました。");
  return jsonResponse({ menus: data }, { headers });
}

export async function createMenu(req: Request, client: SupabaseClient, headers: HeadersInit) {
  const body = await parseJsonBody(req);
  const name = requireNonEmptyString(body.name, "メニュー名");
  const price = requirePositiveInt(body.price, "価格");
  const durationMinutes = requirePositiveInt(body.duration_minutes, "所要時間");
  const description = body.description?.trim() || null;
  const sortOrder = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;

  const { data, error } = await client
    .from("menus")
    .insert({ name, price, duration_minutes: durationMinutes, description, sort_order: sortOrder })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new ApiError("INTERNAL_ERROR", "メニューの作成に失敗しました。");
  return jsonResponse({ menu: data }, { status: 201, headers });
}

// DELETE /admin-menus/:id — 削除を試みる。予約実績(reservations.menu_id)が一度でもある
// メニューはDBの外部キー制約で物理削除できないため、その場合はエラーメッセージで
// 「掲載終了はis_active=falseで」運用を案内する(実際に使われたことのないテスト作成分などは削除できる)。
export async function deleteMenu(id: string, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定されたメニューが見つかりません。");

  const { data, error } = await client.from("menus").delete().eq("id", id).select("id").maybeSingle();
  if (error) {
    // 23503 = foreign_key_violation。reservations.menu_idから参照されている(=予約実績がある)。
    if (error.code === "23503") {
      throw new ApiError("VALIDATION_ERROR", "このメニューは予約実績があるため削除できません。「LPに公開する」のチェックを外してください。");
    }
    throw new ApiError("INTERNAL_ERROR", "メニューの削除に失敗しました。");
  }
  if (!data) throw new ApiError("NOT_FOUND", "指定されたメニューが見つかりません。");
  return jsonResponse({ deleted: true }, { headers });
}

// PATCH /admin-menus/:id
export async function updateMenu(id: string, req: Request, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定されたメニューが見つかりません。");
  const body = await parseJsonBody(req);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = requireNonEmptyString(body.name, "メニュー名");
  if (body.price !== undefined) patch.price = requirePositiveInt(body.price, "価格");
  if (body.duration_minutes !== undefined) patch.duration_minutes = requirePositiveInt(body.duration_minutes, "所要時間");
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  const { data, error } = await client
    .from("menus")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "メニューの更新に失敗しました。");
  if (!data) throw new ApiError("NOT_FOUND", "指定されたメニューが見つかりません。");
  return jsonResponse({ menu: data }, { headers });
}

async function parseJsonBody(req: Request): Promise<MenuBody> {
  try {
    return (await req.json()) as MenuBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
