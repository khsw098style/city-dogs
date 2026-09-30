import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groupExclusionsByStaff, staffCanPerformMenus } from "./staffMenuCapability.ts";

Deno.test("staffCanPerformMenus: 除外が無ければ何を選んでも対応可能", () => {
  assertEquals(staffCanPerformMenus(new Set(), ["cut1"]), true);
  assertEquals(staffCanPerformMenus(new Set(), ["cut1", "perm1"]), true);
});

Deno.test("staffCanPerformMenus: 選択したメニューのどれか1つでも除外に含まれていれば不可", () => {
  const excluded = new Set(["perm1"]);
  assertEquals(staffCanPerformMenus(excluded, ["cut1"]), true);
  assertEquals(staffCanPerformMenus(excluded, ["perm1"]), false);
  assertEquals(staffCanPerformMenus(excluded, ["cut1", "perm1"]), false);
});

Deno.test("staffCanPerformMenus: メニュー未選択(空配列)は対応可能扱い(呼び出し元で別途弾く)", () => {
  assertEquals(staffCanPerformMenus(new Set(["perm1"]), []), true);
});

Deno.test("groupExclusionsByStaff: staff_idごとに除外menu_idの集合へまとめる", () => {
  const grouped = groupExclusionsByStaff([
    { staff_id: "s1", menu_id: "perm1" },
    { staff_id: "s1", menu_id: "perm2" },
    { staff_id: "s2", menu_id: "color1" },
  ]);
  assertEquals(grouped.get("s1"), new Set(["perm1", "perm2"]));
  assertEquals(grouped.get("s2"), new Set(["color1"]));
  assertEquals(grouped.get("s3"), undefined);
});

Deno.test("groupExclusionsByStaff: 空配列なら空のMap", () => {
  assertEquals(groupExclusionsByStaff([]).size, 0);
});
