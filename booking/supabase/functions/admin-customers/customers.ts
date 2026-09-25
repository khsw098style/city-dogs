import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";
import { parseTstzRange } from "../_shared/range.ts";
import {
  isValidEmail,
  isValidJpMobilePhone,
  isValidUuid,
  normalizePhone,
  requireNonEmptyString,
} from "../_shared/validation.ts";

interface CustomerBody {
  name?: string;
  name_kana?: string | null;
  phone?: string;
  email?: string | null;
  notes?: string | null;
  no_show_count?: number;
  is_blocked?: boolean;
}

const SELECT_COLUMNS = "id, name, name_kana, phone, email, notes, no_show_count, is_blocked, created_at, updated_at";
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

// GET /admin-customers?phone=&name=&limit=&offset= — 電話番号(前方一致)・氏名(部分一致)で検索する。
// お客様管理(SALON BOARD相当)の一覧画面用。予約一覧の検索(admin-reservations)とは別リソース。
export async function listCustomers(url: URL, client: SupabaseClient, headers: HeadersInit) {
  const phone = url.searchParams.get("phone");
  const name = url.searchParams.get("name");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  let query = client
    .from("customers")
    .select(SELECT_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (phone) query = query.ilike("phone", `${normalizePhone(phone)}%`);
  if (name) query = query.ilike("name", `%${name}%`);

  const { data, error, count } = await query;
  if (error) throw new ApiError("INTERNAL_ERROR", "顧客一覧の取得に失敗しました。");
  return jsonResponse({ customers: data, total: count ?? data?.length ?? 0, limit, offset }, { headers });
}

// GET /admin-customers/:id — 詳細と、直近の予約履歴(最大20件)をあわせて返す。
// no_show_count/is_blockedを判断する材料として、来店実績を見られるようにする。
export async function getCustomer(id: string, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定された顧客が見つかりません。");

  const { data: customer, error } = await client.from("customers").select(SELECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "顧客情報の取得に失敗しました。");
  if (!customer) throw new ApiError("NOT_FOUND", "指定された顧客が見つかりません。");

  const { data: reservations, error: resErr } = await client
    .from("reservations")
    .select("id, reservation_number, status, source, time_range, price_at_booking, final_price")
    .eq("customer_id", id)
    .order("time_range", { ascending: false })
    .limit(20);
  if (resErr) throw new ApiError("INTERNAL_ERROR", "予約履歴の取得に失敗しました。");

  const reservationHistory = (reservations ?? []).map((r) => {
    const range = parseTstzRange(r.time_range as unknown as string);
    return {
      id: r.id,
      reservation_number: r.reservation_number,
      status: r.status,
      source: r.source,
      start_at: range.start.toISOString(),
      end_at: range.end.toISOString(),
      // 会計金額が確定していればそれを(実際に支払われた金額)、未入力なら予約時点の金額を表示する。
      price: r.final_price ?? r.price_at_booking,
    };
  });

  return jsonResponse({ customer, reservations: reservationHistory }, { headers });
}

// PATCH /admin-customers/:id — no_show_count/is_blockedの更新が主用途だが、
// 電話口での聞き間違い等の訂正用に氏名・電話番号・メール・メモも編集できるようにする。
export async function updateCustomer(id: string, req: Request, client: SupabaseClient, headers: HeadersInit) {
  if (!isValidUuid(id)) throw new ApiError("NOT_FOUND", "指定された顧客が見つかりません。");
  const body = await parseJsonBody(req);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = requireNonEmptyString(body.name, "氏名");
  if (body.name_kana !== undefined) patch.name_kana = body.name_kana?.trim() || null;
  if (body.phone !== undefined) {
    const phone = requireNonEmptyString(body.phone, "電話番号");
    if (!isValidJpMobilePhone(phone)) {
      throw new ApiError("VALIDATION_ERROR", "電話番号の形式が正しくありません(例: 090-1234-5678)。");
    }
    patch.phone = normalizePhone(phone);
  }
  if (body.email !== undefined) {
    const email = body.email?.trim() || null;
    if (email && !isValidEmail(email)) {
      throw new ApiError("VALIDATION_ERROR", "メールアドレスの形式が正しくありません。");
    }
    patch.email = email;
  }
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.no_show_count !== undefined) {
    const n = Number(body.no_show_count);
    if (!Number.isInteger(n) || n < 0) {
      throw new ApiError("VALIDATION_ERROR", "no_show_count は0以上の整数で指定してください。");
    }
    patch.no_show_count = n;
  }
  if (body.is_blocked !== undefined) patch.is_blocked = Boolean(body.is_blocked);

  const { data, error } = await client
    .from("customers")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) {
    // 23505 = unique_violation。customers.phoneのunique制約に別の顧客の番号とぶつかった場合。
    if (error.code === "23505") {
      throw new ApiError("VALIDATION_ERROR", "この電話番号は既に別の顧客で登録されています。");
    }
    throw new ApiError("INTERNAL_ERROR", "顧客情報の更新に失敗しました。");
  }
  if (!data) throw new ApiError("NOT_FOUND", "指定された顧客が見つかりません。");
  return jsonResponse({ customer: data }, { headers });
}

async function parseJsonBody(req: Request): Promise<CustomerBody> {
  try {
    return (await req.json()) as CustomerBody;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
