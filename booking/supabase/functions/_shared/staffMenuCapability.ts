import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";

// スタッフ×メニューの対応可否(2026-09-30導入)。migrations/0015参照。
// 除外リスト方式: staff_menu_exclusionsに行が無ければ「全メニュー対応可能」。

export interface StaffMenuExclusionRow {
  staff_id: string;
  menu_id: string;
}

// 純粋ロジック(Supabase非依存)。単体テストはstaffMenuCapability.test.ts参照。
// 指定スタッフの除外メニューIDの集合を渡し、menuIdsのどれか1つでも含まれていればfalse。
export function staffCanPerformMenus(
  excludedMenuIds: ReadonlySet<string>,
  menuIds: readonly string[],
): boolean {
  return !menuIds.some((id) => excludedMenuIds.has(id));
}

// 除外行の配列を staff_id -> 除外menu_idの集合、にまとめる。GET /staffでの複数スタッフ一括判定に使う。
export function groupExclusionsByStaff(rows: readonly StaffMenuExclusionRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    let set = map.get(row.staff_id);
    if (!set) {
      set = new Set();
      map.set(row.staff_id, set);
    }
    set.add(row.menu_id);
  }
  return map;
}

// ---- I/O ----

export async function fetchStaffMenuExclusions(
  client: SupabaseClient,
  staffIds?: readonly string[],
): Promise<StaffMenuExclusionRow[]> {
  let query = client.from("staff_menu_exclusions").select("staff_id, menu_id");
  if (staffIds && staffIds.length > 0) query = query.in("staff_id", staffIds);
  const { data, error } = await query;
  if (error) throw new ApiError("INTERNAL_ERROR", "スタッフの対応メニュー情報の取得に失敗しました。");
  return data ?? [];
}

// 単一スタッフが、指定したメニューすべてに対応できるかをサーバー側で検証する。対応できなければ
// STAFF_MENU_MISMATCHエラーを投げる。GET /availability(→POST /reservations・POST /admin-reservations
// の再検証を兼ねる)・リスケジュールで担当を変更する時に使う。
export async function assertStaffCanPerformMenus(
  client: SupabaseClient,
  staffId: string,
  menuIds: readonly string[],
): Promise<void> {
  const exclusions = await fetchStaffMenuExclusions(client, [staffId]);
  const excludedIds = new Set(exclusions.map((e) => e.menu_id));
  if (!staffCanPerformMenus(excludedIds, menuIds)) {
    throw new ApiError(
      "STAFF_MENU_MISMATCH",
      "指定された担当スタイリストは、選択したメニューに対応していません。担当を変更するか、他のメニューをお選びください。",
    );
  }
}
