// 公開Functions(menus, availability, reservations)向けのCORS設定。
// ALLOWED_ORIGINS環境変数(カンマ区切り)にLPの本番/開発オリジンを設定する。
// 未設定時は開発しやすさを優先して "*" を許可する(本番運用開始前に必ず設定すること)。

const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin =
    configuredOrigins.length === 0
      ? "*"
      : origin && configuredOrigins.includes(origin)
        ? origin
        : configuredOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("origin")) });
  }
  return null;
}
