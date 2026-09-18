import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aggregateRevenueByStaff } from "./revenue.ts";

const STAFF_A = { id: "staff-a", name: "スタイリストA" };
const STAFF_B = { id: "staff-b", name: "スタイリストB" };

Deno.test("aggregateRevenueByStaff: completedはforecastにもactualにも計上される", () => {
  const result = aggregateRevenueByStaff(
    [STAFF_A],
    [{ staff_id: STAFF_A.id, status: "completed", price_at_booking: 4000 }],
  );
  assertEquals(result, [
    { staff_id: STAFF_A.id, staff_name: STAFF_A.name, forecast_count: 1, forecast_amount: 4000, actual_count: 1, actual_amount: 4000 },
  ]);
});

Deno.test("aggregateRevenueByStaff: confirmed(来店前)はforecastのみでactualには入らない", () => {
  const result = aggregateRevenueByStaff(
    [STAFF_A],
    [{ staff_id: STAFF_A.id, status: "confirmed", price_at_booking: 5000 }],
  );
  assertEquals(result[0].forecast_count, 1);
  assertEquals(result[0].forecast_amount, 5000);
  assertEquals(result[0].actual_count, 0);
  assertEquals(result[0].actual_amount, 0);
});

Deno.test("aggregateRevenueByStaff: cancelled/no_show/declinedはforecast・actualどちらにも計上しない", () => {
  const result = aggregateRevenueByStaff(
    [STAFF_A],
    [
      { staff_id: STAFF_A.id, status: "cancelled_by_customer", price_at_booking: 4000 },
      { staff_id: STAFF_A.id, status: "cancelled_by_salon", price_at_booking: 4000 },
      { staff_id: STAFF_A.id, status: "no_show", price_at_booking: 4000 },
      { staff_id: STAFF_A.id, status: "declined", price_at_booking: 4000 },
      { staff_id: STAFF_A.id, status: "auto_cancelled", price_at_booking: 4000 },
    ],
  );
  assertEquals(result[0].forecast_count, 0);
  assertEquals(result[0].forecast_amount, 0);
  assertEquals(result[0].actual_count, 0);
  assertEquals(result[0].actual_amount, 0);
});

Deno.test("aggregateRevenueByStaff: 複数スタッフ・複数ステータスが混在していても正しく振り分けられる", () => {
  const result = aggregateRevenueByStaff(
    [STAFF_A, STAFF_B],
    [
      { staff_id: STAFF_A.id, status: "completed", price_at_booking: 3000 },
      { staff_id: STAFF_A.id, status: "confirmed", price_at_booking: 5000 },
      { staff_id: STAFF_B.id, status: "completed", price_at_booking: 4000 },
      { staff_id: STAFF_B.id, status: "cancelled_by_customer", price_at_booking: 9999 },
    ],
  );
  const a = result.find((r) => r.staff_id === STAFF_A.id)!;
  const b = result.find((r) => r.staff_id === STAFF_B.id)!;
  assertEquals(a.forecast_count, 2);
  assertEquals(a.forecast_amount, 8000);
  assertEquals(a.actual_count, 1);
  assertEquals(a.actual_amount, 3000);
  assertEquals(b.forecast_count, 1);
  assertEquals(b.forecast_amount, 4000);
  assertEquals(b.actual_count, 1);
  assertEquals(b.actual_amount, 4000);
});

Deno.test("aggregateRevenueByStaff: 稼働中スタッフ一覧に無いstaff_idの予約は無視される(退職者等)", () => {
  const result = aggregateRevenueByStaff(
    [STAFF_A],
    [{ staff_id: "former-staff", status: "completed", price_at_booking: 999999 }],
  );
  assertEquals(result.length, 1);
  assertEquals(result[0].forecast_amount, 0);
  assertEquals(result[0].actual_amount, 0);
});

Deno.test("aggregateRevenueByStaff: 予約が1件も無いスタッフは0件・0円で返る", () => {
  const result = aggregateRevenueByStaff([STAFF_A, STAFF_B], []);
  assertEquals(result.length, 2);
  result.forEach((r) => {
    assertEquals(r.forecast_count, 0);
    assertEquals(r.forecast_amount, 0);
    assertEquals(r.actual_count, 0);
    assertEquals(r.actual_amount, 0);
  });
});
