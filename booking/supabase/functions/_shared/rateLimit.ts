import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";

// Supabaseのエッジ基盤がクライアントの実IPを先頭に付与するため、この値は
// クライアント側から偽装できない(リクエストヘッダーとして直接送ってもここでは無視され、
// 基盤が上書きする)。ローカル実行等でヘッダー自体が無い場合は全リクエストを
// 1つのバケットに丸めるフォールバックにする(その環境でのみ制限が緩くなる)。
export function extractClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  const first = forwardedFor.split(",")[0]?.trim();
  return first || "unknown";
}

export interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

// 各Functionのルーティングから、処理本体に入る前に呼ぶ。
// 上限を超えていれば ApiError("RATE_LIMITED") を投げて呼び出し元に429を返させる。
//
// rate_limit_hit RPC自体が失敗した場合(接続断・マイグレーション未反映等)は
// fail-open(素通しする)。レート制限は総当たり対策の多層防御の1つであり、
// これの不調で予約受付そのものを止めてしまう方が実害が大きいため
// (RESEND_API_KEY未設定時のメール送信フェイルセーフと同じ考え方)。
export async function enforceRateLimit(
  client: SupabaseClient,
  req: Request,
  options: RateLimitOptions,
): Promise<void> {
  const ip = extractClientIp(req);
  const key = `${options.bucket}:${ip}`;

  const { data: allowed, error } = await client.rpc("rate_limit_hit", {
    p_key: key,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });

  if (error) {
    console.error("rate_limit_hit failed (fail-open):", error);
    return;
  }

  if (!allowed) {
    throw new ApiError("RATE_LIMITED", "試行回数が多すぎます。しばらく時間をおいて再度お試しください。");
  }
}
