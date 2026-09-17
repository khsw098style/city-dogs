// /admin/site-content 配下のルーティング(要ログイン)。LPコンテンツ(CONCEPT/SHOP&STYLE/STAFF紹介文)の編集用。
//   GET/POST            /admin/site-content/features      -> listFeatures / createFeature
//   PATCH/DELETE         /admin/site-content/features/:id -> updateFeature / deleteFeature
//   GET/POST            /admin/site-content/gallery       -> listGalleryPhotos / createGalleryPhoto
//   PATCH/DELETE         /admin/site-content/gallery/:id  -> updateGalleryPhoto / deleteGalleryPhoto
//   GET/POST            /admin/site-content/staff         -> listStaffBios / createStaff
//   PATCH/DELETE         /admin/site-content/staff/:id    -> updateStaffBio(業務項目+LP紹介文の両方) / deleteStaff
//   GET/PUT             /admin/site-content/rating        -> getRating / updateRating(★評価バッジの手動更新)
//
// 実際のデプロイ先はSupabase Edge Functionsの仕様上 `admin-site-content` という1つの
// 関数名になる(admin-reservationsと同じ方式)。MENU & PRICEの編集(/admin/menus)は
// 別関数として今後実装する(api-design.md参照)。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireStaff } from "../_shared/auth.ts";
import { createFeature, deleteFeature, listFeatures, updateFeature } from "./features.ts";
import { createGalleryPhoto, deleteGalleryPhoto, listGalleryPhotos, updateGalleryPhoto } from "./gallery.ts";
import { createStaff, deleteStaff, listStaffBios, updateStaffBio } from "./staff.ts";
import { getRating, updateRating } from "./rating.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const client = serviceClient();
    await requireStaff(req, client);

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const anchor = segments.indexOf("admin-site-content");
    const subPath = anchor === -1 ? [] : segments.slice(anchor + 1);
    const [resource, resourceId] = subPath;

    if (resource === "features") {
      if (req.method === "GET" && !resourceId) return await listFeatures(client, headers);
      if (req.method === "POST" && !resourceId) return await createFeature(req, client, headers);
      if (req.method === "PATCH" && resourceId) return await updateFeature(resourceId, req, client, headers);
      if (req.method === "DELETE" && resourceId) return await deleteFeature(resourceId, client, headers);
    }

    if (resource === "gallery") {
      if (req.method === "GET" && !resourceId) return await listGalleryPhotos(client, headers);
      if (req.method === "POST" && !resourceId) return await createGalleryPhoto(req, client, headers);
      if (req.method === "PATCH" && resourceId) return await updateGalleryPhoto(resourceId, req, client, headers);
      if (req.method === "DELETE" && resourceId) return await deleteGalleryPhoto(resourceId, client, headers);
    }

    if (resource === "staff") {
      if (req.method === "GET" && !resourceId) return await listStaffBios(client, headers);
      if (req.method === "POST" && !resourceId) return await createStaff(req, client, headers);
      if (req.method === "PATCH" && resourceId) return await updateStaffBio(resourceId, req, client, headers);
      if (req.method === "DELETE" && resourceId) return await deleteStaff(resourceId, client, headers);
    }

    if (resource === "rating" && !resourceId) {
      if (req.method === "GET") return await getRating(client, headers);
      if (req.method === "PUT") return await updateRating(req, client, headers);
    }

    throw new ApiError("NOT_FOUND", "対応していないエンドポイントです。");
  } catch (err) {
    return errorResponse(err, headers);
  }
});
