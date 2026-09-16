// /reservations 配下のルーティング。
//   POST   /reservations                            -> createReservation
//   GET    /reservations/lookup                     -> lookupReservation(電話番号+予約番号)
//   GET    /reservations/manage                     -> getReservationByToken(メール記載のトークン)
//   POST   /reservations/manage/cancel               -> cancelReservationByToken
//   POST   /reservations/:reservation_number/cancel  -> cancelReservation(電話番号確認)
//
// Supabaseは `https://.../functions/v1/reservations/...` の形でパスを渡してくるため、
// "reservations" より後ろの部分を自前でパースしてサブルーティングする。
// "manage"系は2セグメントパターンが":reservation_number/cancel"と衝突しうるため、
// より具体的な"manage"判定を先に評価する順序にしている。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { createReservation } from "./create.ts";
import { lookupReservation } from "./lookup.ts";
import { cancelReservation } from "./cancel.ts";
import { getReservationByToken, cancelReservationByToken } from "./manage.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const anchor = segments.indexOf("reservations");
    const subPath = anchor === -1 ? [] : segments.slice(anchor + 1);

    const client = serviceClient();

    if (req.method === "POST" && subPath.length === 0) {
      // スパム・ボットによる大量登録の抑止(Turnstile等の追加対策は別途検討)。
      await enforceRateLimit(client, req, { bucket: "reservations-create", limit: 10, windowSeconds: 600 });
      return await createReservation(req, client, headers);
    }

    if (req.method === "GET" && subPath.length === 1 && subPath[0] === "lookup") {
      // reservation_numberが連番のため、phoneとの総当たりを防ぐ本命の制限。
      await enforceRateLimit(client, req, { bucket: "reservations-lookup", limit: 10, windowSeconds: 300 });
      return await lookupReservation(url, client, headers);
    }

    if (req.method === "GET" && subPath.length === 1 && subPath[0] === "manage") {
      // manage_tokenはUUIDで総当たり自体が非現実的だが、念のため多層防御として設定。
      await enforceRateLimit(client, req, { bucket: "reservations-manage", limit: 20, windowSeconds: 300 });
      return await getReservationByToken(url, client, headers);
    }

    if (req.method === "POST" && subPath.length === 2 && subPath[0] === "manage" && subPath[1] === "cancel") {
      await enforceRateLimit(client, req, { bucket: "reservations-manage-cancel", limit: 10, windowSeconds: 300 });
      return await cancelReservationByToken(req, client, headers);
    }

    if (req.method === "POST" && subPath.length === 2 && subPath[1] === "cancel") {
      // reservation_number(連番)+phoneの総当たりで他人の予約を無断キャンセルされないための制限。
      await enforceRateLimit(client, req, { bucket: "reservations-cancel", limit: 10, windowSeconds: 300 });
      return await cancelReservation(decodeURIComponent(subPath[0]), req, client, headers);
    }

    throw new ApiError("NOT_FOUND", "対応していないエンドポイントです。");
  } catch (err) {
    return errorResponse(err, headers);
  }
});
