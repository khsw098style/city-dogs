import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ApiError } from "./http.ts";
import { type MenuRow, parseMenuIds, resolveMenuSelection } from "./menuSelection.ts";

function menu(id: string, name: string, category: MenuRow["category"], price: number, minutes: number, isFrom = false): MenuRow {
  return { id, name, category, price, duration_minutes: minutes, price_is_from: isFrom, is_active: true };
}

const CUT = menu("cut1", "カット", "cut", 4000, 40);
const CUT_TEEN = menu("cut2", "中学生以下カット", "cut", 2200, 30, true);
const COLOR = menu("color1", "カラー", "color", 4500, 60, true);
const PERM = menu("perm1", "パーマ", "perm", 5500, 90, true);
const TWIST = menu("perm2", "ツイスト", "perm", 6000, 120, true);
const SHAVE = menu("opt1", "顔剃り", "option", 800, 10);
const BROW = menu("opt2", "眉毛整え", "option", 500, 10);
const INACTIVE = { ...menu("old1", "旧メニュー", "cut", 4300, 40), is_active: false };

const ALL = [CUT, CUT_TEEN, COLOR, PERM, TWIST, SHAVE, BROW, INACTIVE];

function assertApiError(fn: () => unknown, code: string) {
  const err = assertThrows(fn, ApiError);
  assertEquals((err as ApiError).code, code);
}

Deno.test("resolveMenuSelection: カット単体は価格・所要時間がそのまま", () => {
  const s = resolveMenuSelection(ALL, ["cut1"]);
  assertEquals(s.totalPrice, 4000);
  assertEquals(s.totalDurationMinutes, 40);
  assertEquals(s.priceIsFrom, false);
  assertEquals(s.primary.id, "cut1");
  assertEquals(s.name, "カット");
});

Deno.test("resolveMenuSelection: カット+パーマ+顔剃りは単純加算(セット割引なし)、名前は区分順で連結", () => {
  // 指定順を区分順と違えても、cut→perm→option の順に並ぶ
  const s = resolveMenuSelection(ALL, ["opt1", "perm1", "cut1"]);
  assertEquals(s.totalPrice, 4000 + 5500 + 800);
  assertEquals(s.totalDurationMinutes, 40 + 90 + 10);
  assertEquals(s.name, "カット + パーマ + 顔剃り");
  assertEquals(s.primary.id, "cut1");
});

Deno.test("resolveMenuSelection: 1つでも「〜」付きが含まれれば合計も「〜」", () => {
  assertEquals(resolveMenuSelection(ALL, ["cut1", "opt1"]).priceIsFrom, false);
  assertEquals(resolveMenuSelection(ALL, ["cut1", "color1"]).priceIsFrom, true);
});

Deno.test("resolveMenuSelection: パーマ単体・カラー単体でも予約できる(主メニューはその区分)", () => {
  assertEquals(resolveMenuSelection(ALL, ["perm2"]).primary.id, "perm2");
  assertEquals(resolveMenuSelection(ALL, ["color1", "opt2"]).primary.id, "color1");
});

Deno.test("resolveMenuSelection: 主メニューは cut > color > perm の優先順", () => {
  assertEquals(resolveMenuSelection(ALL, ["perm1", "color1"]).primary.id, "color1");
  assertEquals(resolveMenuSelection(ALL, ["perm1", "cut1", "color1"]).primary.id, "cut1");
});

Deno.test("resolveMenuSelection: オプションのみは不可", () => {
  assertApiError(() => resolveMenuSelection(ALL, ["opt1"]), "VALIDATION_ERROR");
  assertApiError(() => resolveMenuSelection(ALL, ["opt1", "opt2"]), "VALIDATION_ERROR");
});

Deno.test("resolveMenuSelection: カットは同じ区分から1つまで", () => {
  assertApiError(() => resolveMenuSelection(ALL, ["cut1", "cut2"]), "VALIDATION_ERROR");
});

Deno.test("resolveMenuSelection: パーマとツイストは同時に選べて単純合算(カット+パーマ+ツイスト)", () => {
  const s = resolveMenuSelection(ALL, ["cut1", "perm1", "perm2"]);
  assertEquals(s.items.length, 3);
  assertEquals(s.primary.id, "cut1");
  assertEquals(s.totalPrice, 4000 + 5500 + 6000);
  assertEquals(s.totalDurationMinutes, CUT.duration_minutes + PERM.duration_minutes + TWIST.duration_minutes);
  assertEquals(s.priceIsFrom, true);
  // パーマ+ツイストのみ(カットなし)でも主メニュー扱いで予約できる
  assertEquals(resolveMenuSelection(ALL, ["perm1", "perm2"]).items.length, 2);
});

Deno.test("resolveMenuSelection: オプションは複数選べる", () => {
  const s = resolveMenuSelection(ALL, ["cut1", "opt1", "opt2"]);
  assertEquals(s.totalPrice, 4000 + 800 + 500);
  assertEquals(s.items.length, 3);
});

Deno.test("resolveMenuSelection: 空・重複・存在しない・非公開のメニューは拒否", () => {
  assertApiError(() => resolveMenuSelection(ALL, []), "VALIDATION_ERROR");
  assertApiError(() => resolveMenuSelection(ALL, ["cut1", "cut1"]), "VALIDATION_ERROR");
  assertApiError(() => resolveMenuSelection(ALL, ["nope"]), "NOT_FOUND");
  assertApiError(() => resolveMenuSelection(ALL, ["old1"]), "NOT_FOUND");
  assertApiError(() => resolveMenuSelection(ALL, ["cut1", "old1"]), "NOT_FOUND");
});

Deno.test("parseMenuIds: 配列・カンマ区切り・旧形式menu_idのいずれも配列に正規化する", () => {
  assertEquals(parseMenuIds({ menu_ids: ["a", "b"] }), ["a", "b"]);
  assertEquals(parseMenuIds({ menu_ids: "a, b,,c" }), ["a", "b", "c"]);
  assertEquals(parseMenuIds({ menu_id: "a" }), ["a"]);
  assertEquals(parseMenuIds({ menu_ids: ["a"], menu_id: "z" }), ["a"]);
  assertEquals(parseMenuIds({}), []);
});
