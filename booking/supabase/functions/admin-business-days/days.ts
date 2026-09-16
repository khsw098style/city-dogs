import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError, jsonResponse } from "../_shared/http.ts";

interface BusinessDayBody {
  is_open?: boolean;
  open_time?: string | null;
  close_time?: string | null;
  last_reception_time?: string | null;
  note?: string | null;
}

interface GenerateMonthBody {
  year?: number;
  month?: number; // 1-12
}

const SELECT_COLUMNS = "date, is_open, open_time, close_time, last_reception_time, note";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

// GET /admin-business-days?date_from=&date_to= — 指定範囲(通常は1か月分)の営業日設定を返す。
// 行が存在しない日は「未設定」であり、営業日か休業日かはこのAPIのレスポンスだけでは判断できない
// (管理画面側で「未設定」として明示する想定。generateMonthで埋めるまでは空のまま)。
export async function listBusinessDays(url: URL, client: SupabaseClient, headers: HeadersInit) {
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  if (!dateFrom || !DATE_RE.test(dateFrom)) {
    throw new ApiError("VALIDATION_ERROR", "date_from は YYYY-MM-DD 形式で指定してください。");
  }
  if (!dateTo || !DATE_RE.test(dateTo)) {
    throw new ApiError("VALIDATION_ERROR", "date_to は YYYY-MM-DD 形式で指定してください。");
  }

  const { data, error } = await client
    .from("business_days")
    .select(SELECT_COLUMNS)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date", { ascending: true });
  if (error) throw new ApiError("INTERNAL_ERROR", "営業日情報の取得に失敗しました。");
  return jsonResponse({ business_days: data }, { headers });
}

// PUT /admin-business-days/:date — 1日分の営業日設定をupsertする(date が主キーなので新規/更新を問わない)。
export async function upsertBusinessDay(date: string, req: Request, client: SupabaseClient, headers: HeadersInit) {
  if (!DATE_RE.test(date)) throw new ApiError("VALIDATION_ERROR", "date は YYYY-MM-DD 形式で指定してください。");
  const body = await parseJsonBody<BusinessDayBody>(req);
  const isOpen = body.is_open ?? true;

  if (isOpen) {
    if (!body.open_time || !TIME_RE.test(body.open_time)) {
      throw new ApiError("VALIDATION_ERROR", "開店時刻(open_time)をHH:MM形式で指定してください。");
    }
    if (!body.close_time || !TIME_RE.test(body.close_time)) {
      throw new ApiError("VALIDATION_ERROR", "閉店時刻(close_time)をHH:MM形式で指定してください。");
    }
    if (body.last_reception_time && !TIME_RE.test(body.last_reception_time)) {
      throw new ApiError("VALIDATION_ERROR", "最終受付時刻(last_reception_time)の形式が不正です。");
    }
  }

  const row = {
    date,
    is_open: isOpen,
    // 休業日は時刻をnullにする(DBのcheck制約と同じ考え方。中途半端な時刻が残らないようにする)。
    open_time: isOpen ? body.open_time : null,
    close_time: isOpen ? body.close_time : null,
    last_reception_time: isOpen ? (body.last_reception_time || null) : null,
    note: body.note?.trim() || null,
  };

  const { data, error } = await client
    .from("business_days")
    .upsert(row, { onConflict: "date" })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new ApiError("INTERNAL_ERROR", "営業日情報の保存に失敗しました。");
  return jsonResponse({ business_day: data }, { headers });
}

// POST /admin-business-days/generate-month — 指定月のうち、まだ行が存在しない日だけに
// デフォルト値を一括生成する(SALON BOARDの「毎月の受付設定」を月初にまとめて行う運用を想定)。
// 既にカスタマイズ済みの日(祝日・臨時休業など)は上書きしない(ON CONFLICT DO NOTHING)。
// デフォルト値(平日10-18時・土日9-18時・最終受付17時・月曜/第4日曜定休)はseed.sqlの生成ロジックを
// 踏襲した暫定値(実際の営業時間はCLAUDE.mdの「⚠️営業時間の要確認」参照。要確認事項)。
export async function generateMonth(req: Request, client: SupabaseClient, headers: HeadersInit) {
  const body = await parseJsonBody<GenerateMonthBody>(req);
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new ApiError("VALIDATION_ERROR", "year が不正です。");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError("VALIDATION_ERROR", "month は1〜12で指定してください。");
  }

  const rows = buildDefaultMonthRows(year, month);
  const { data, error } = await client
    .from("business_days")
    .upsert(rows, { onConflict: "date", ignoreDuplicates: true })
    .select("date");
  if (error) throw new ApiError("INTERNAL_ERROR", "営業日の一括生成に失敗しました。");
  return jsonResponse({ generated: data?.length ?? 0 }, { status: 201, headers });
}

function buildDefaultMonthRows(year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows: Array<{
    date: string;
    is_open: boolean;
    open_time: string | null;
    close_time: string | null;
    last_reception_time: string | null;
    note: string | null;
  }> = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay(); // 0=日 ... 6=土
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isFourthSunday = dow === 0 && Math.ceil(day / 7) === 4;

    if (dow === 1 || isFourthSunday) {
      rows.push({
        date: dateStr,
        is_open: false,
        open_time: null,
        close_time: null,
        last_reception_time: null,
        note: dow === 1 ? "定休日(月曜)" : "定休日(第4日曜)",
      });
    } else {
      const isWeekend = dow === 0 || dow === 6;
      rows.push({
        date: dateStr,
        is_open: true,
        open_time: isWeekend ? "09:00" : "10:00",
        close_time: "18:00",
        last_reception_time: "17:00",
        note: null,
      });
    }
  }
  return rows;
}

async function parseJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストボディの形式が不正です(JSONを指定してください)。");
  }
}
