import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";

interface RatingBody {
  rating?: number;
  review_count?: number;
}

const SELECT_COLUMNS = "rating, review_count, updated_at";

// GET /admin-site-content/rating — 現在のLP評価バッジの表示値を返す
export async function getRating(client: SupabaseClient, headers: HeadersInit) {
  const { data, error } = await client.from("site_rating").select(SELECT_COLUMNS).eq("id", 1).maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "評価情報の取得に失敗しました。");
  return jsonResponse({ rating: data }, { headers });
}

// PUT /admin-site-content/rating — HotPepper等の実際の掲載ページを見ながら手動で数字を更新する。
// 単一行(id=1)固定なので、作成・削除エンドポイントは設けない。
export async function updateRating(req: Request, client: SupabaseClient, headers: HeadersInit) {
  const body = await parseJsonBody(req);

  const rating = requireRatingScore(body.rating);
  const reviewCount = requireReviewCount(body.review_count);

  const { data, error } = await client
    .from("site_rating")
    .update({ rating, review_count: reviewCount, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "評価情報の更新に失敗しました。");
  if (!data) throw new ApiError("NOT_FOUND", "評価情報が見つかりません。");
  return jsonResponse({ rating: data }, { headers });
}

function requireRatingScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 5) {
    throw new ApiError("VALIDATION_ERROR", "評価スコアは0〜5の数値で入力してください。");
  }
  return Math.round(num * 100) / 100;
}

function requireReviewCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new ApiError("VALIDATION_ERROR", "口コミ件数は0以上の整数で入力してください。");
  }
  return num;
}

async function parseJsonBody(req: Request): Promise<RatingBody> {
  try {
    return (await req.json()) as RatingBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
