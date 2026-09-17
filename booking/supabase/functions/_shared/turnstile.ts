// Cloudflare Turnstile(ボット対策)のサーバー側検証。
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// TURNSTILE_SECRET_KEY未設定の間はfail-soft(検証をスキップして通す)。
// RESEND_API_KEY等と同じ考え方: 未設定のせいで予約自体を止めたくない。
// Cloudflareへの通信自体が失敗した場合も同様にfail-openとする(一時的な外部障害で
// 実際の顧客の予約をブロックする方が、まれなボット通過を許すより実害が大きいため)。
export async function verifyTurnstile(token: string | undefined, remoteIp?: string): Promise<boolean> {
  const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secretKey) {
    console.error("TURNSTILE_SECRET_KEY が未設定のため、Turnstile検証をスキップしました。");
    return true;
  }
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch(VERIFY_URL, { method: "POST", body });
    if (!res.ok) {
      console.error("Turnstile検証に失敗しました(APIエラー):", res.status);
      return true;
    }
    const data = await res.json();
    return data?.success === true;
  } catch (err) {
    console.error("Turnstile検証に失敗しました(通信エラー):", err);
    return true;
  }
}
