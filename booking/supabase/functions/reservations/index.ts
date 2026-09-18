// /reservations 配下のルーティング。
//   POST   /reservations                            -> createReservation
//   GET    /reservations/manage                     -> getReservationByToken(メール記載のトークン)
//   POST   /reservations/manage/cancel               -> cancelReservationByToken
//
// Supabaseは `https://.../functions/v1/reservations/...` の形でパスを渡してくるため、
// "reservations" より後ろの部分を自前でパースしてサブルーティングする。
//
// 【2026-09-18削除】電話番号+予約番号方式の照会・キャンセル(GET /reservations/lookup、
// POST /reservations/:reservation_number/cancel)は、コードレビューで「呼び出し元のUIが
// LP・管理画面のどちらにも存在しない、認証なしの公開API」であることが判明したため削除した。
// 設計意図(api-design.md記載)は「電話口での問い合わせ向け」だったが、その用途は
// 管理画面の「予約検索」タブ(admin-reservations、要ログイン、電話番号検索対応済み)で
// 既にカバーされており、顧客の自己解決用途は`manage_token`方式(下記2ルート)で足りている。
// 呼び出し元のない公開エンドポイントを残すことは、正規の利用経路がないまま攻撃対象だけを
// 増やすことになるため、機能追加(Turnstile等)ではなく削除で対応した。

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { errorResponse, ApiError } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { createReservation } from "./create.ts";
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
      // スパム・ボットによる大量登録の抑止(Turnstile検証はcreateReservation内で実施)。
      await enforceRateLimit(client, req, { bucket: "reservations-create", limit: 10, windowSeconds: 600 });
      return await createReservation(req, client, headers);
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

    throw new ApiError("NOT_FOUND", "対応していないエンドポイントです。");
  } catch (err) {
    return errorResponse(err, headers);
  }
});
