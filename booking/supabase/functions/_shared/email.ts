// Resend(https://resend.com)のREST APIを直接叩く薄いラッパー。
// SDKは使わず素のfetchにしている(依存を増やさず、Edge Functionsのバンドルを軽く保つため)。

const RESEND_API_URL = "https://api.resend.com/emails";

// ドメイン未検証の間はResendのテスト用共有ドメインを使う。
// 独自ドメインを検証したら RESEND_FROM_ADDRESS のsecretを設定して上書きする。
// 🏪 店舗固有: RESEND_FROM_ADDRESS未設定時のフォールバックなので、あえて店舗名を
// 含めない汎用的な表示名にしてある(設定し忘れても特定の店舗名で送られないようにするため)。
const DEFAULT_FROM = "予約システム <onboarding@resend.dev>";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

// メール送信の失敗で予約作成そのものを失敗させたくないため、
// 呼び出し側は結果を待たず・エラーを投げない(呼び出し側でtry/catchしなくてよい設計)。
// 成功/失敗はログにのみ残す。
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("RESEND_API_KEY が未設定のため、メール送信をスキップしました。", { to, subject });
    return;
  }

  const from = Deno.env.get("RESEND_FROM_ADDRESS") || DEFAULT_FROM;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("メール送信に失敗しました(Resend APIエラー):", res.status, body);
    }
  } catch (err) {
    console.error("メール送信に失敗しました(通信エラー):", err);
  }
}
