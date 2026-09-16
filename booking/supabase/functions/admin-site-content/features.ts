import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { isValidUuid, requireNonEmptyString } from "../_shared/validation.ts";

interface FeatureBody {
  title?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}

const SELECT_COLUMNS = "id, sort_order, title, description, is_active";

// GET /admin-site-content/features — 編集用に非公開(is_active=false)分も含めて全件返す
export async function listFeatures(client: SupabaseClient, headers: HeadersInit) {
  const { data, error } = await client
    .from("site_features")
    .select(SELECT_COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) throw new ApiError("INTERNAL_ERROR", "特徴カードの取得に失敗しました。");
  return jsonResponse({ features: data }, { headers });
}

export async function createFeature(req: Request, client: SupabaseClient, headers: HeadersInit) {
  const body = await parseJsonBody(req);
  const title = requireNonEmptyString(body.title, "タイトル");
  const description = requireNonEmptyString(body.description, "説明文");
  const sortOrder = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;

  const { data, error } = await client
    .from("site_features")
    .insert({ title, description, sort_order: sortOrder })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new ApiError("INTERNAL_ERROR", "特徴カードの作成に失敗しました。");
  return jsonResponse({ feature: data }, { status: 201, headers });
}

export async function updateFeature(id: string, req: Request, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定された特徴カードが見つかりません。");
  const body = await parseJsonBody(req);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = requireNonEmptyString(body.title, "タイトル");
  if (body.description !== undefined) patch.description = requireNonEmptyString(body.description, "説明文");
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  const { data, error } = await client
    .from("site_features")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "特徴カードの更新に失敗しました。");
  if (!data) throw new ApiError("NOT_FOUND", "指定された特徴カードが見つかりません。");
  return jsonResponse({ feature: data }, { headers });
}

export async function deleteFeature(id: string, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定された特徴カードが見つかりません。");
  const { data, error } = await client.from("site_features").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "特徴カードの削除に失敗しました。");
  if (!data) throw new ApiError("NOT_FOUND", "指定された特徴カードが見つかりません。");
  return jsonResponse({ deleted: true }, { headers });
}

async function parseJsonBody(req: Request): Promise<FeatureBody> {
  try {
    return (await req.json()) as FeatureBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
