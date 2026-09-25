import { ApiError } from "./http.ts";

// 「実際の会計金額」(reservations.final_price)の入力ルール。
// Supabaseに依存しない純粋関数にしてあり、単体テストは checkout.test.ts。
//
// ルール(2026-09-25、migrations/0013のコメント参照):
//   1. 会計金額を設定できるのは completed(会計完了)の予約のみ。
//      - 他のステータスへ変更する時、または completed 以外の予約への単独の設定は拒否する。
//      - completed への変更と同時、または既に completed の予約の金額修正は許可する。
//   2. 「〜」付きメニュー(下限価格)を含む予約を completed にする時は入力必須
//      (予約時点の金額は下限でしかなく、そのまま実績にすると売上が過小になるため)。
//   3. 金額は 0 以上の整数(0は無料対応などで許可)。上限は誤入力(桁違い)防止。

export const MAX_FINAL_PRICE = 10_000_000;

export function parseFinalPrice(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > MAX_FINAL_PRICE) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `会計金額は0円以上${MAX_FINAL_PRICE.toLocaleString("ja-JP")}円以下の整数で入力してください。`,
    );
  }
  return raw;
}

export interface ResolveFinalPriceParams {
  currentStatus: string;
  /** 今回のリクエストでステータスを変更する場合の変更後ステータス。 */
  newStatus?: string;
  /** リクエストの final_price(未指定なら undefined)。 */
  finalPrice: unknown;
  /** 予約に「〜」付き(price_is_from)のメニューが含まれるか。 */
  hasEstimatedPrice: boolean;
}

/**
 * 今回の更新で reservations.final_price に書き込む値を返す。書き込まない場合は undefined。
 * ルール違反は ApiError(VALIDATION_ERROR) を投げる。
 */
export function resolveFinalPrice(p: ResolveFinalPriceParams): number | undefined {
  const resultingStatus = p.newStatus ?? p.currentStatus;

  if (p.finalPrice === undefined) {
    if (p.newStatus === "completed" && p.hasEstimatedPrice) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "「〜」付きのメニューを含む予約のため、会計完了にするには実際の会計金額の入力が必要です。",
      );
    }
    return undefined;
  }

  if (resultingStatus !== "completed") {
    throw new ApiError("VALIDATION_ERROR", "会計金額は、会計完了の予約にのみ設定できます。");
  }
  return parseFinalPrice(p.finalPrice);
}
