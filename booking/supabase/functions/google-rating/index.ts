// GET /google-rating — LPのヒーローセクションにある評価バッジ(★スコア・口コミ件数)用。認証不要。
//
// 2026-09-14時点ではプレースホルダー実装: GOOGLE_PLACES_API_KEY / GOOGLE_PLACE_ID の
// secretsが未設定の間は `{ configured: false, rating: null, review_count: null }` を返すだけで、
// LP側はこれを見て現状のハードコード表示(HotPepperの数値)を維持する。
// 将来この2つのsecretを設定するだけで、コード変更なしに実際のGoogle口コミ表示に切り替わる設計。
//
// Google Places API(New)のrating/userRatingCountフィールドはEnterprise SKU(課金区分の中で
// 最も高く、無料枠も月1,000回と少ない)に属するため、DBの1行キャッシュ(google_rating_cache)を
// 介して低頻度(CACHE_TTL_MSおき)にしか実際のAPIを呼ばない設計にしている。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24時間。Enterprise SKUの無料枠(月1,000回)に対して十分に余裕を持たせる

interface RatingResult {
  rating: number | null;
  review_count: number | null;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    if (req.method !== "GET") {
      throw new ApiError("VALIDATION_ERROR", "GETのみ対応しています。");
    }

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    const placeId = Deno.env.get("GOOGLE_PLACE_ID");
    if (!apiKey || !placeId) {
      return jsonResponse({ configured: false, rating: null, review_count: null }, { headers });
    }

    const client = serviceClient();
    const { data: cached, error: cacheErr } = await client
      .from("google_rating_cache")
      .select("rating, review_count, fetched_at")
      .eq("id", 1)
      .maybeSingle();
    if (cacheErr) throw new ApiError("INTERNAL_ERROR", "キャッシュの取得に失敗しました。");

    const isFresh = !!cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS;
    if (isFresh) {
      return jsonResponse({ configured: true, ...pick(cached) }, { headers });
    }

    try {
      const fetched = await fetchFromGoogle(placeId, apiKey);
      await client
        .from("google_rating_cache")
        .update({ rating: fetched.rating, review_count: fetched.review_count, fetched_at: new Date().toISOString() })
        .eq("id", 1);
      return jsonResponse({ configured: true, ...fetched }, { headers });
    } catch (fetchErr) {
      // Google側の一時的な障害・レート制限時は、古くてもキャッシュ済みの値を返す(fail-soft)。
      console.error("Google Places API fetch failed:", fetchErr);
      return jsonResponse(
        { configured: true, ...(cached ? pick(cached) : { rating: null, review_count: null }) },
        { headers },
      );
    }
  } catch (err) {
    return errorResponse(err, headers);
  }
});

function pick(row: { rating: number | null; review_count: number | null }): RatingResult {
  return { rating: row.rating, review_count: row.review_count };
}

async function fetchFromGoogle(placeId: string, apiKey: string): Promise<RatingResult> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "rating,userRatingCount",
    },
  });
  if (!res.ok) {
    throw new Error(`Google Places API error: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return {
    rating: typeof body.rating === "number" ? body.rating : null,
    review_count: typeof body.userRatingCount === "number" ? body.userRatingCount : null,
  };
}
