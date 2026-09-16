import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { isValidUuid, requireNonEmptyString } from "../_shared/validation.ts";

const VALID_KINDS = ["interior", "style"] as const;
type GalleryKind = (typeof VALID_KINDS)[number];

interface GalleryBody {
  kind?: string;
  image_url?: string;
  caption?: string;
  sort_order?: number;
  is_active?: boolean;
}

const SELECT_COLUMNS = "id, kind, image_url, caption, sort_order, is_active";

// GET /admin-site-content/gallery — 編集用に非公開分も含めて全件返す
export async function listGalleryPhotos(client: SupabaseClient, headers: HeadersInit) {
  const { data, error } = await client
    .from("site_gallery_photos")
    .select(SELECT_COLUMNS)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new ApiError("INTERNAL_ERROR", "写真の取得に失敗しました。");
  return jsonResponse({ photos: data }, { headers });
}

export async function createGalleryPhoto(req: Request, client: SupabaseClient, headers: HeadersInit) {
  const body = await parseJsonBody(req);
  const kind = requireValidKind(body.kind);
  const imageUrl = requireNonEmptyString(body.image_url, "画像URL");
  const caption = body.caption?.trim() || null;
  const sortOrder = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;

  const { data, error } = await client
    .from("site_gallery_photos")
    .insert({ kind, image_url: imageUrl, caption, sort_order: sortOrder })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new ApiError("INTERNAL_ERROR", "写真の登録に失敗しました。");
  return jsonResponse({ photo: data }, { status: 201, headers });
}

export async function updateGalleryPhoto(id: string, req: Request, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定された写真が見つかりません。");
  const body = await parseJsonBody(req);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.kind !== undefined) patch.kind = requireValidKind(body.kind);
  if (body.image_url !== undefined) patch.image_url = requireNonEmptyString(body.image_url, "画像URL");
  if (body.caption !== undefined) patch.caption = body.caption?.trim() || null;
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  const { data, error } = await client
    .from("site_gallery_photos")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "写真の更新に失敗しました。");
  if (!data) throw new ApiError("NOT_FOUND", "指定された写真が見つかりません。");
  return jsonResponse({ photo: data }, { headers });
}

export async function deleteGalleryPhoto(id: string, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定された写真が見つかりません。");
  const { data, error } = await client.from("site_gallery_photos").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "写真の削除に失敗しました。");
  if (!data) throw new ApiError("NOT_FOUND", "指定された写真が見つかりません。");
  return jsonResponse({ deleted: true }, { headers });
}

function requireValidKind(kind: string | undefined): GalleryKind {
  if (!kind || !VALID_KINDS.includes(kind as GalleryKind)) {
    throw new ApiError("VALIDATION_ERROR", `kind は ${VALID_KINDS.join(" / ")} のいずれかを指定してください。`);
  }
  return kind as GalleryKind;
}

async function parseJsonBody(req: Request): Promise<GalleryBody> {
  try {
    return (await req.json()) as GalleryBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
