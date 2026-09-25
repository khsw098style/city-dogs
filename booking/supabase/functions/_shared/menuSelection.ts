import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";
import { isValidUuid } from "./validation.ts";

// 1予約で複数メニュー(カット+パーマ+顔剃り等)を選べるようにするための選択ルールの実装。
// resolveMenuSelection()はSupabaseに依存しない純粋関数(単体テストは menuSelection.test.ts)。
// ルールの意図・背景は migrations/0012 のコメント参照。

export type MenuCategory = "cut" | "color" | "perm" | "option";

// 主メニュー(単独で予約可能)の区分。この並び順が、複数選択時の「主メニュー(reservations.menu_id)」の
// 優先順位と、メニュー名を連結する時の表示順を兼ねる。
const MAIN_CATEGORIES: MenuCategory[] = ["cut", "color", "perm"];
const CATEGORY_ORDER: MenuCategory[] = [...MAIN_CATEGORIES, "option"];

// 同じ区分から1つしか選べない区分。パーマ区分(パーマ・ツイスト)は別メニューだが
// ほぼ併用で注文されるため対象外(2026-09-25、店舗回答)で、複数選択できる。
const SINGLE_SELECT_CATEGORIES: MenuCategory[] = ["cut", "color"];

export interface MenuRow {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  category: MenuCategory;
  price_is_from: boolean;
  is_active: boolean;
}

export interface MenuSelection {
  items: MenuRow[]; // 区分順(cut→color→perm→option)、同区分内は指定順
  primary: MenuRow; // 主メニュー(reservations.menu_idに入れる)
  name: string; // 「カット + パーマ + 顔剃り」のような連結名(メール・一覧表示用)
  totalPrice: number;
  totalDurationMinutes: number;
  priceIsFrom: boolean; // 1つでも「〜」付きが含まれれば true
}

// 選択されたメニューIDを検証し、合計金額・合計所要時間を計算する。
// menus は候補となる全メニュー(存在確認と区分の取得に使う)。
export function resolveMenuSelection(menus: MenuRow[], ids: string[]): MenuSelection {
  if (ids.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "メニューを選択してください。");
  }
  if (new Set(ids).size !== ids.length) {
    throw new ApiError("VALIDATION_ERROR", "同じメニューが重複して選択されています。");
  }

  const byId = new Map(menus.map((m) => [m.id, m]));
  const chosen: MenuRow[] = [];
  for (const id of ids) {
    const menu = byId.get(id);
    if (!menu || !menu.is_active) {
      throw new ApiError("NOT_FOUND", "指定されたメニューが見つかりません。");
    }
    chosen.push(menu);
  }

  for (const category of SINGLE_SELECT_CATEGORIES) {
    if (chosen.filter((m) => m.category === category).length > 1) {
      throw new ApiError("VALIDATION_ERROR", `同じ区分(${CATEGORY_LABEL[category]})のメニューは1つまでしか選べません。`);
    }
  }
  if (!chosen.some((m) => MAIN_CATEGORIES.includes(m.category))) {
    throw new ApiError("VALIDATION_ERROR", "カット・カラー・パーマのいずれかを選択してください(オプションのみのご予約はできません)。");
  }

  const items = [...chosen].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );

  return {
    items,
    primary: items[0],
    name: items.map((m) => m.name).join(" + "),
    totalPrice: items.reduce((sum, m) => sum + m.price, 0),
    totalDurationMinutes: items.reduce((sum, m) => sum + m.duration_minutes, 0),
    priceIsFrom: items.some((m) => m.price_is_from),
  };
}

const CATEGORY_LABEL: Record<MenuCategory, string> = {
  cut: "カット",
  color: "カラー",
  perm: "パーマ",
  option: "オプション",
};

// ---- I/O ----------------------------------------------------------------

const MENU_COLUMNS = "id, name, price, duration_minutes, category, price_is_from, is_active";

export async function loadMenuSelection(client: SupabaseClient, ids: string[]): Promise<MenuSelection> {
  if (ids.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "メニューを選択してください。");
  }
  // 不正な形式のままPostgRESTに投げるとDBエラー(500)になるため、事前に弾く(validation.tsのisValidUuid参照)。
  if (!ids.every(isValidUuid)) {
    throw new ApiError("NOT_FOUND", "指定されたメニューが見つかりません。");
  }
  const { data, error } = await client.from("menus").select(MENU_COLUMNS).in("id", ids);
  if (error) throw new ApiError("INTERNAL_ERROR", "メニュー情報の取得に失敗しました。");
  return resolveMenuSelection((data ?? []) as MenuRow[], ids);
}

// 予約に含まれるメニューを reservation_items に保存する。予約(reservations)のINSERT直後に呼ぶ。
// 保存に失敗した場合は、メニュー内訳のない予約が残らないよう予約自体を取り消してからエラーにする
// (Supabase JSONクライアントでは2テーブルへの書き込みを1トランザクションにできないための補償処理)。
export async function insertReservationItems(
  client: SupabaseClient,
  reservationId: string,
  selection: MenuSelection,
): Promise<void> {
  const rows = selection.items.map((m, i) => ({
    reservation_id: reservationId,
    menu_id: m.id,
    price_at_booking: m.price,
    duration_minutes: m.duration_minutes,
    price_is_from: m.price_is_from,
    sort_order: i,
  }));
  const { error } = await client.from("reservation_items").insert(rows);
  if (error) {
    console.error("reservation_items insert failed:", error);
    await client.from("reservations").delete().eq("id", reservationId);
    throw new ApiError("INTERNAL_ERROR", "予約の登録に失敗しました。");
  }
}

export interface ReservationMenuLabel {
  name: string; // 「カット + パーマ + 顔剃り」のような連結名
  priceIsFrom: boolean;
}

// 予約ごとのメニュー表示名(管理画面の一覧・スケジュール用)。reservation_itemsの内訳から作る。
// 内訳のない予約(移行前の古いデータ等)は結果に含まれないので、呼び出し側で reservations.menu_id 由来の
// メニュー名にフォールバックすること。
export async function loadReservationMenuLabels(
  client: SupabaseClient,
  reservationIds: string[],
): Promise<Map<string, ReservationMenuLabel>> {
  const labels = new Map<string, ReservationMenuLabel>();
  if (reservationIds.length === 0) return labels;

  const { data: items, error } = await client
    .from("reservation_items")
    .select("reservation_id, menu_id, sort_order, price_is_from")
    .in("reservation_id", reservationIds);
  if (error) throw new ApiError("INTERNAL_ERROR", "予約メニューの取得に失敗しました。");
  if (!items || items.length === 0) return labels;

  const menuIds = [...new Set(items.map((i) => i.menu_id as string))];
  const { data: menus, error: menuErr } = await client.from("menus").select("id, name").in("id", menuIds);
  if (menuErr) throw new ApiError("INTERNAL_ERROR", "メニュー情報の取得に失敗しました。");
  const nameById = new Map((menus ?? []).map((m) => [m.id as string, m.name as string]));

  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const list = grouped.get(item.reservation_id as string) ?? [];
    list.push(item);
    grouped.set(item.reservation_id as string, list);
  }
  for (const [reservationId, list] of grouped) {
    const sorted = [...list].sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
    labels.set(reservationId, {
      name: sorted.map((i) => nameById.get(i.menu_id as string) ?? "").filter(Boolean).join(" + "),
      priceIsFrom: sorted.some((i) => i.price_is_from as boolean),
    });
  }
  return labels;
}

// クエリ文字列・リクエストボディで受け取ったメニューID指定を配列に正規化する。
// 新形式 menu_ids(配列またはカンマ区切り文字列)を優先し、旧形式 menu_id(単一)も受け付ける
// (デプロイ順の都合で古いフロントエンドが残っている間も動くようにするため)。
export function parseMenuIds(input: { menu_ids?: unknown; menu_id?: unknown }): string[] {
  const raw = input.menu_ids ?? (input.menu_id != null ? [input.menu_id] : []);
  const list = Array.isArray(raw) ? raw : String(raw).split(",");
  return list.map((v) => String(v).trim()).filter((v) => v.length > 0);
}
