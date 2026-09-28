import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ApiError } from "./http.ts";
import { assertRoleCanUseMethod, type StaffRole } from "./auth.ts";

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const READ_METHODS = ["GET", "HEAD", "OPTIONS"];
const SHOP_ROLES: StaffRole[] = ["owner", "stylist", "assistant"];

Deno.test("maintainerは閲覧系メソッドを許可する", () => {
  for (const method of READ_METHODS) {
    assertRoleCanUseMethod("maintainer", method);
  }
});

Deno.test("maintainerは書き込み系メソッドをFORBIDDENで拒否する", () => {
  for (const method of WRITE_METHODS) {
    const err = assertThrows(() => assertRoleCanUseMethod("maintainer", method), ApiError);
    assertEquals(err.code, "FORBIDDEN");
  }
});

Deno.test("maintainerのメソッド判定は大文字小文字を区別しない", () => {
  assertRoleCanUseMethod("maintainer", "get");
  assertThrows(() => assertRoleCanUseMethod("maintainer", "patch"), ApiError);
});

Deno.test("店舗スタッフ(owner/stylist/assistant)は書き込みも許可される(全スタッフ同権限の既存仕様)", () => {
  for (const role of SHOP_ROLES) {
    for (const method of [...READ_METHODS, ...WRITE_METHODS]) {
      assertRoleCanUseMethod(role, method);
    }
  }
});
