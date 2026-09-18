// スタイリストごとの月次売上(見込み・実績)集計。
// 「見込み」= その月の予約のうちキャンセル・無断キャンセル以外すべて(まだ来店前のものも含む、
// 今月このまま進めば得られる想定の売上)。
// 「実績」= そのうちcompleted(会計完了)のみ(実際に確定した売上)。
// 2026-09-18、ユーザーとの合意に基づく定義。
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
}

export function aggregateRevenueByStaff(
  staffList: StaffInfoForRevenue[],
  reservations: ReservationForRevenue[],
): StaffRevenueSummary[] {
  const summaryByStaff = new Map<string, StaffRevenueSummary>(
    staffList.map((s) => [
      s.id,
      { staff_id: s.id, staff_name: s.name, forecast_count: 0, forecast_amount: 0, actual_count: 0, actual_amount: 0 },
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
      entry.forecast_amount += r.price_at_booking;
    }
    if (r.status === "completed") {
      entry.actual_count += 1;
      entry.actual_amount += r.price_at_booking;
    }
  }

  return [...summaryByStaff.values()];
}
