import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseTstzRange } from "./range.ts";

Deno.test("parseTstzRange: 両端閉区間っぽい表記([...])でもstart/endが取れる", () => {
  const result = parseTstzRange('["2026-09-20 10:00:00+09","2026-09-20 10:30:00+09")');
  assertEquals(result.start.toISOString(), new Date("2026-09-20 10:00:00+09").toISOString());
  assertEquals(result.end.toISOString(), new Date("2026-09-20 10:30:00+09").toISOString());
});

Deno.test("parseTstzRange: ダブルクォート無しの表記も解析できる", () => {
  const result = parseTstzRange("[2026-09-20 10:00:00+09,2026-09-20 10:30:00+09)");
  assertEquals(result.start.toISOString(), new Date("2026-09-20 10:00:00+09").toISOString());
  assertEquals(result.end.toISOString(), new Date("2026-09-20 10:30:00+09").toISOString());
});

Deno.test("parseTstzRange: 開始側が丸括弧(排他的下限)でも解析できる", () => {
  const result = parseTstzRange('("2026-09-20 10:00:00+09","2026-09-20 10:30:00+09")');
  assertEquals(result.start.toISOString(), new Date("2026-09-20 10:00:00+09").toISOString());
});

Deno.test("parseTstzRange: UTCオフセット表記(+00)でも解析できる", () => {
  const result = parseTstzRange('["2026-09-20 01:00:00+00","2026-09-20 01:30:00+00")');
  assertEquals(result.start.toISOString(), "2026-09-20T01:00:00.000Z");
});

Deno.test("parseTstzRange: 不正な形式はErrorを投げる", () => {
  assertThrows(() => parseTstzRange("not-a-range"), Error, "予約時間帯の解析に失敗しました");
});

Deno.test("parseTstzRange: 空文字はErrorを投げる", () => {
  assertThrows(() => parseTstzRange(""), Error);
});
