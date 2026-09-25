import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ApiError } from "./http.ts";
import { MAX_FINAL_PRICE, parseFinalPrice, resolveFinalPrice } from "./checkout.ts";

function assertValidationError(fn: () => unknown) {
  const err = assertThrows(fn, ApiError);
  assertEquals((err as ApiError).code, "VALIDATION_ERROR");
}

Deno.test("parseFinalPrice: 0以上の整数(0と上限ちょうど含む)は受理", () => {
  assertEquals(parseFinalPrice(0), 0);
  assertEquals(parseFinalPrice(12500), 12500);
  assertEquals(parseFinalPrice(MAX_FINAL_PRICE), MAX_FINAL_PRICE);
});

Deno.test("parseFinalPrice: 負数・小数・上限超・数値以外・null・NaNは拒否", () => {
  assertValidationError(() => parseFinalPrice(-1));
  assertValidationError(() => parseFinalPrice(1000.5));
  assertValidationError(() => parseFinalPrice(MAX_FINAL_PRICE + 1));
  assertValidationError(() => parseFinalPrice("12000"));
  assertValidationError(() => parseFinalPrice(null));
  assertValidationError(() => parseFinalPrice(Number.NaN));
  assertValidationError(() => parseFinalPrice(Number.POSITIVE_INFINITY));
});

Deno.test("resolveFinalPrice: 会計完了への変更と同時なら設定できる", () => {
  assertEquals(
    resolveFinalPrice({ currentStatus: "awaiting_checkout", newStatus: "completed", finalPrice: 15500, hasEstimatedPrice: true }),
    15500,
  );
});

Deno.test("resolveFinalPrice: 既にcompletedの予約の金額修正(ステータス変更なし)は許可", () => {
  assertEquals(
    resolveFinalPrice({ currentStatus: "completed", finalPrice: 9000, hasEstimatedPrice: true }),
    9000,
  );
});

Deno.test("resolveFinalPrice: 「〜」付きを含む予約をcompletedにする時、金額未指定は拒否", () => {
  assertValidationError(() =>
    resolveFinalPrice({ currentStatus: "awaiting_checkout", newStatus: "completed", finalPrice: undefined, hasEstimatedPrice: true })
  );
});

Deno.test("resolveFinalPrice: 「〜」なしの予約をcompletedにする時、金額未指定は許可(undefined=書き込まない)", () => {
  assertEquals(
    resolveFinalPrice({ currentStatus: "awaiting_checkout", newStatus: "completed", finalPrice: undefined, hasEstimatedPrice: false }),
    undefined,
  );
});

Deno.test("resolveFinalPrice: completed以外への変更・completed以外の予約への設定は拒否", () => {
  // 会計待ち→(ステータス変更なし)で金額だけ設定
  assertValidationError(() =>
    resolveFinalPrice({ currentStatus: "awaiting_checkout", finalPrice: 5000, hasEstimatedPrice: false })
  );
  // キャンセルへの変更と同時
  assertValidationError(() =>
    resolveFinalPrice({ currentStatus: "confirmed", newStatus: "cancelled_by_salon", finalPrice: 5000, hasEstimatedPrice: false })
  );
});

Deno.test("resolveFinalPrice: 金額が不正なら(completedでも)拒否、nullでの取り消しも不可", () => {
  assertValidationError(() =>
    resolveFinalPrice({ currentStatus: "completed", finalPrice: -100, hasEstimatedPrice: false })
  );
  assertValidationError(() =>
    resolveFinalPrice({ currentStatus: "completed", finalPrice: null, hasEstimatedPrice: true })
  );
});

Deno.test("resolveFinalPrice: ステータスも金額も変えない更新では何も書き込まない", () => {
  assertEquals(
    resolveFinalPrice({ currentStatus: "confirmed", finalPrice: undefined, hasEstimatedPrice: true }),
    undefined,
  );
});
