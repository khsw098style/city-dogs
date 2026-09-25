import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { parseTstzRange } from "../_shared/range.ts";
import { loadReservationMenuLabels } from "../_shared/menuSelection.ts";
import { normalizePhone } from "../_shared/validation.ts";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;
const JST_OFFSET = "+09:00";

// GET /admin/reservations?date=&date_from=&date_to=&status=&reservation_number=&phone=&customer_name=&limit=&offset=
// 予約の検索・一覧(SALON BOARDの「予約一覧」画面相当)。
export async function listReservations(url: URL, client: SupabaseClient, headers: HeadersInit) {
  const params = url.searchParams;
  const singleDate = params.get("date");
  const dateFrom = params.get("date_from") ?? singleDate;
  const dateTo = params.get("date_to") ?? singleDate;
  const statusParam = params.get("status");
  const reservationNumber = params.get("reservation_number");
  const phone = params.get("phone");
  const customerName = params.get("customer_name");
  const limit = Math.min(Math.max(Number(params.get("limit")) || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
  const offset = Math.max(Number(params.get("offset")) || 0, 0);

  // 顧客名・電話番号での検索は、先に customers を引いてから reservations を絞り込む
  let customerIdFilter: string[] | null = null;
  if (customerName || phone) {
    let custQuery = client.from("customers").select("id");
    if (customerName) custQuery = custQuery.ilike("name", `%${customerName}%`);
    if (phone) custQuery = custQuery.ilike("phone", `${normalizePhone(phone)}%`);
    const { data: matched, error: custErr } = await custQuery;
    if (custErr) throw new ApiError("INTERNAL_ERROR", "顧客検索に失敗しました。");
    customerIdFilter = (matched ?? []).map((c) => c.id as string);
    if (customerIdFilter.length === 0) {
      return jsonResponse({ reservations: [], total: 0, limit, offset }, { headers });
    }
  }

  let query = client
    .from("reservations")
    .select(
      "id, reservation_number, staff_id, menu_id, customer_id, status, source, time_range, price_at_booking, notes",
      { count: "exact" },
    )
    .order("time_range", { ascending: false })
    .range(offset, offset + limit - 1);

  if (reservationNumber) query = query.eq("reservation_number", reservationNumber);
  if (statusParam) query = query.in("status", statusParam.split(",").map((s) => s.trim()).filter(Boolean));
  if (customerIdFilter) query = query.in("customer_id", customerIdFilter);

  if (dateFrom) {
    const from = `${dateFrom}T00:00:00${JST_OFFSET}`;
    const toBase = dateTo ?? dateFrom;
    const toDate = new Date(`${toBase}T00:00:00${JST_OFFSET}`);
    toDate.setDate(toDate.getDate() + 1); // to側は「その日を含む」ので翌日0時を上限にする
    query = query.filter("time_range", "ov", `[${from},${toDate.toISOString()})`);
  }

  const { data: reservations, error, count } = await query;
  if (error) throw new ApiError("INTERNAL_ERROR", "予約一覧の取得に失敗しました。");

  const staffIds = [...new Set((reservations ?? []).map((r) => r.staff_id as string).filter(Boolean))];
  const menuIds = [...new Set((reservations ?? []).map((r) => r.menu_id as string))];
  const custIds = [...new Set((reservations ?? []).map((r) => r.customer_id as string))];
  const noMatchId = "00000000-0000-0000-0000-000000000000";

  const [{ data: staffRows, error: staffErr }, { data: menuRows, error: menuErr }, { data: custRows, error: custErr }] =
    await Promise.all([
      client.from("staff").select("id, name").in("id", staffIds.length > 0 ? staffIds : [noMatchId]),
      client.from("menus").select("id, name").in("id", menuIds.length > 0 ? menuIds : [noMatchId]),
      client.from("customers").select("id, name, phone").in("id", custIds.length > 0 ? custIds : [noMatchId]),
    ]);
  if (staffErr) throw new ApiError("INTERNAL_ERROR", "スタッフ情報の取得に失敗しました。");
  if (menuErr) throw new ApiError("INTERNAL_ERROR", "メニュー情報の取得に失敗しました。");
  if (custErr) throw new ApiError("INTERNAL_ERROR", "顧客情報の取得に失敗しました。");

  const staffNameById = new Map((staffRows ?? []).map((s) => [s.id as string, s.name as string]));
  const menuNameById = new Map((menuRows ?? []).map((m) => [m.id as string, m.name as string]));
  const custById = new Map((custRows ?? []).map((c) => [c.id as string, c]));
  const menuLabels = await loadReservationMenuLabels(client, (reservations ?? []).map((r) => r.id as string));

  const result = (reservations ?? []).map((r) => {
    const range = parseTstzRange(r.time_range as unknown as string);
    return {
      id: r.id,
      reservation_number: r.reservation_number,
      status: r.status,
      source: r.source,
      start_at: range.start.toISOString(),
      end_at: range.end.toISOString(),
      price: r.price_at_booking,
      notes: r.notes,
      staff_id: r.staff_id ?? null,
      staff_name: r.staff_id ? staffNameById.get(r.staff_id as string) ?? null : null,
      menu_id: r.menu_id,
      // 複数メニュー選択の予約は連結名(「カット + パーマ」)。内訳のない古い予約は主メニュー名にフォールバック。
      menu_name: menuLabels.get(r.id as string)?.name ?? menuNameById.get(r.menu_id as string) ?? null,
      price_is_from: menuLabels.get(r.id as string)?.priceIsFrom ?? false,
      customer: custById.get(r.customer_id as string) ?? null,
    };
  });

  return jsonResponse({ reservations: result, total: count ?? result.length, limit, offset }, { headers });
}
