// スタイリストごとの月次売上(見込み・実績)集計。
// 「見込み」= その月の予約のうちキャンセル・無断キャンセル以外すべて(まだ来店前のものも含む、
// 今月このまま進めば得られる想定の売上)。
// 「実績」= そのうちcompleted(会計完了)のみ(実際に確定した売上)。
// 2026-09-18、ユーザーとの合意に基づく定義。
//
// 金額(2026-09-25〜): 会計完了(completed)の予約に「実際の会計金額」(final_price)が入力されていれば、
// 見込み・実績のどちらでもそれを使う(確定した金額なので)。未入力ならprice_at_booking(予約時点の金額)。
// 「〜」付きメニュー(下限価格)を含み、かつ会計金額が確定していない予約が含まれる集計は、
// 金額が下限であることを画面に示すためforecast_has_estimate/actual_has_estimateをtrueにする。
//
// I/O(Supabase呼び出し)とは分離した純粋関数にしてあるので、Supabase接続なしで
// 単体テストできる(revenue.test.ts参照。availability.tsのgenerateSlots()と同じ方針)。

export const FORECAST_STATUSES: ReadonlySet<string> = new Set([
  "tentative",
  "confirmed",
  "in_service",
  "awaiting_checkout",
  "completed",
]);

export interface ReservationForRevenue {
  staff_id: string;
  status: string;
  price_at_booking: number;
  /** 実際の会計金額。completedの予約のみ設定される。 */
  final_price?: number | null;
  /** 予約に「〜」付き(price_is_from)のメニューが含まれるか。 */
  has_estimated_price?: boolean;
}

export interface StaffInfoForRevenue {
  id: string;
  name: string;
}

export interface StaffRevenueSummary {
  staff_id: string;
  staff_name: string;
  forecast_count: number;
  forecast_amount: number;
  actual_count: number;
  actual_amount: number;
  /** 見込みの合計に、会計金額が未確定の「〜」付き予約(下限価格で計上)が含まれる。 */
  forecast_has_estimate: boolean;
  /** 実績の合計に、会計金額が未入力の「〜」付き予約(下限価格で計上)が含まれる(過去データ等)。 */
  actual_has_estimate: boolean;
}

// 会計金額が確定しているか(completedかつfinal_price入力済み)。
function hasConfirmedPrice(r: ReservationForRevenue): boolean {
  return r.status === "completed" && r.final_price != null;
}

function effectiveAmount(r: ReservationForRevenue): number {
  return hasConfirmedPrice(r) ? (r.final_price as number) : r.price_at_booking;
}

function isEstimate(r: ReservationForRevenue): boolean {
  return Boolean(r.has_estimated_price) && !hasConfirmedPrice(r);
}

export function aggregateRevenueByStaff(
  staffList: StaffInfoForRevenue[],
  reservations: ReservationForRevenue[],
): StaffRevenueSummary[] {
  const summaryByStaff = new Map<string, StaffRevenueSummary>(
    staffList.map((s) => [
      s.id,
      {
        staff_id: s.id,
        staff_name: s.name,
        forecast_count: 0,
        forecast_amount: 0,
        actual_count: 0,
        actual_amount: 0,
        forecast_has_estimate: false,
        actual_has_estimate: false,
      },
    ]),
  );

  for (const r of reservations) {
    const entry = summaryByStaff.get(r.staff_id);
    // 現在は稼働していない(退職済み等)スタッフの予約は集計対象外。
    // 過去にそのスタッフが担当した実績は、稼働中スタッフの一覧に出てこない現状の
    // 画面設計では表示先が無いため、意図的にドロップする(2026-09-18時点の割り切り)。
    if (!entry) continue;

    if (FORECAST_STATUSES.has(r.status)) {
      entry.forecast_count += 1;
      entry.forecast_amount += effectiveAmount(r);
      if (isEstimate(r)) entry.forecast_has_estimate = true;
    }
    if (r.status === "completed") {
      entry.actual_count += 1;
      entry.actual_amount += effectiveAmount(r);
      if (isEstimate(r)) entry.actual_has_estimate = true;
    }
  }

  return [...summaryByStaff.values()];
}
