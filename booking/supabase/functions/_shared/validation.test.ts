import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ApiError } from "./http.ts";
import {
  isValidEmail,
  isValidJpMobilePhone,
  isValidUuid,
  normalizePhone,
  requireNonEmptyString,
} from "./validation.ts";

// ---- isValidJpMobilePhone -------------------------------------------

Deno.test("isValidJpMobilePhone: ハイフンありの携帯番号は有効(090/080/070)", () => {
  assertEquals(isValidJpMobilePhone("090-1234-5678"), true);
  assertEquals(isValidJpMobilePhone("080-1234-5678"), true);
  assertEquals(isValidJpMobilePhone("070-1234-5678"), true);
});

Deno.test("isValidJpMobilePhone: ハイフンなしの携帯番号も有効", () => {
  assertEquals(isValidJpMobilePhone("09012345678"), true);
});

Deno.test("isValidJpMobilePhone: 固定電話(03等)は無効", () => {
  assertEquals(isValidJpMobilePhone("03-1234-5678"), false);
});

Deno.test("isValidJpMobilePhone: 桁数が足りない/多いものは無効", () => {
  assertEquals(isValidJpMobilePhone("090-1234-567"), false);
  assertEquals(isValidJpMobilePhone("090-1234-56789"), false);
});

Deno.test("isValidJpMobilePhone: 前後の空白は許容される", () => {
  assertEquals(isValidJpMobilePhone("  090-1234-5678  "), true);
});

// ---- normalizePhone ----------------------------------------------------

Deno.test("normalizePhone: ハイフンを除去し前後の空白をtrimする", () => {
  assertEquals(normalizePhone(" 090-1234-5678 "), "09012345678");
});

Deno.test("normalizePhone: ハイフンが無くても壊れない", () => {
  assertEquals(normalizePhone("09012345678"), "09012345678");
});

// ---- isValidEmail --------------------------------------------------------

Deno.test("isValidEmail: 一般的な形式は有効", () => {
  assertEquals(isValidEmail("taro@example.com"), true);
});

Deno.test("isValidEmail: @が無い/ドメインにドットが無いものは無効", () => {
  assertEquals(isValidEmail("taro-example.com"), false);
  assertEquals(isValidEmail("taro@examplecom"), false);
});

Deno.test("isValidEmail: 空白を含むものは無効", () => {
  assertEquals(isValidEmail("ta ro@example.com"), false);
});

// ---- isValidUuid -----------------------------------------------------

Deno.test("isValidUuid: 正しいUUID(v4)は有効", () => {
  assertEquals(isValidUuid("550e8400-e29b-41d4-a716-446655440000"), true);
});

Deno.test("isValidUuid: 大文字混じりでも有効(大文字小文字を区別しない)", () => {
  assertEquals(isValidUuid("550E8400-E29B-41D4-A716-446655440000"), true);
});

Deno.test("isValidUuid: manage_tokenの不正値(invalid-token)は無効", () => {
  assertEquals(isValidUuid("invalid-token"), false);
});

Deno.test("isValidUuid: 桁数が足りないものは無効", () => {
  assertEquals(isValidUuid("550e8400-e29b-41d4-a716-44665544000"), false);
});

Deno.test("isValidUuid: 空文字は無効", () => {
  assertEquals(isValidUuid(""), false);
});

// ---- requireNonEmptyString ----------------------------------------------

Deno.test("requireNonEmptyString: 値があればtrimして返す", () => {
  assertEquals(requireNonEmptyString("  テスト太郎  ", "name"), "テスト太郎");
});

Deno.test("requireNonEmptyString: 空文字・空白のみはApiError(VALIDATION_ERROR)を投げる", () => {
  const err = assertThrows(() => requireNonEmptyString("   ", "name"), ApiError);
  assertEquals(err.code, "VALIDATION_ERROR");
});

Deno.test("requireNonEmptyString: undefinedはApiErrorを投げる", () => {
  assertThrows(() => requireNonEmptyString(undefined, "name"), ApiError);
});

Deno.test("requireNonEmptyString: 数値などstring以外の型もApiErrorを投げる", () => {
  assertThrows(() => requireNonEmptyString(123, "name"), ApiError);
});
