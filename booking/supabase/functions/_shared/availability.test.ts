import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  addMinutes,
  type BookedRange,
  type BusinessDayInfo,
  generateSlots,
  overlaps,
  type ShiftInfo,
  type StaffInfo,
  toJstDate,
} from "./availability.ts";

// テスト全体で使う共通の営業日設定: 10:00-18:00営業、最終受付17:00
const OPEN_DAY: BusinessDayInfo = {
  is_open: true,
  open_time: "10:00:00",
  close_time: "18:00:00",
  last_reception_time: "17:00:00",
};

const DATE = "2026-09-20";
const STAFF_A: StaffInfo = { id: "staff-a", name: "スタッフA" };
const STAFF_B: StaffInfo = { id: "staff-b", name: "スタッフB" };

// 過去判定に引っかからないよう、営業日より十分前の時刻をデフォルトの"now"にする
const FAR_PAST_NOW = toJstDate(DATE, "00:00:00");

function fullDayShift(staffId: string): ShiftInfo {
  return { staff_id: staffId, is_working: true, start_time: null, end_time: null };
}

function baseParams(overrides: Partial<Parameters<typeof generateSlots>[0]> = {}) {
  return {
    date: DATE,
    durationMinutes: 30,
    businessDay: OPEN_DAY,
    staffList: [STAFF_A],
    shiftByStaff: new Map([[STAFF_A.id, fullDayShift(STAFF_A.id)]]),
    bookedByStaff: new Map<string, BookedRange[]>(),
    now: FAR_PAST_NOW,
    ...overrides,
  };
}

// ---- 休業日・営業時間未設定 -------------------------------------------

Deno.test("generateSlots: is_open=falseなら休業扱いでslotsは空", () => {
  const result = generateSlots(baseParams({ businessDay: { ...OPEN_DAY, is_open: false } }));
  assertEquals(result.closed, true);
  assertEquals(result.slots, []);
});

Deno.test("generateSlots: businessDayがnull(営業日未設定)でも休業扱い", () => {
  const result = generateSlots(baseParams({ businessDay: null }));
  assertEquals(result.closed, true);
  assertEquals(result.slots, []);
});

Deno.test("generateSlots: open_time/close_timeが欠けていれば休業扱い", () => {
  const result = generateSlots(baseParams({ businessDay: { ...OPEN_DAY, open_time: null } }));
  assertEquals(result.closed, true);
});

// ---- toJstDateのJST→UTC変換そのものを独立検証 ------------------------------
// (他のテストはtoJstDateで期待値も作っているため、この関数自体のバグは他のテストでは検出できない)

Deno.test("toJstDate: JST 10:00はUTC 01:00になる(+09:00オフセット)", () => {
  assertEquals(toJstDate("2026-09-20", "10:00:00").toISOString(), "2026-09-20T01:00:00.000Z");
});

Deno.test("toJstDate: JST 00:00は前日UTC 15:00になる(日付またぎ)", () => {
  assertEquals(toJstDate("2026-09-20", "00:00:00").toISOString(), "2026-09-19T15:00:00.000Z");
});

Deno.test("toJstDate: JST 09:00はUTC日付が変わる境界(00:00)になる", () => {
  assertEquals(toJstDate("2026-09-20", "09:00:00").toISOString(), "2026-09-20T00:00:00.000Z");
});

// ---- 基本の枠生成 -------------------------------------------------------

Deno.test("generateSlots: 営業時間内に30分刻みで枠が生成される", () => {
  const result = generateSlots(baseParams());
  assertEquals(result.closed, false);
  // 10:00始まり、最終受付17:00まで30分刻み -> (17:00-10:00)/30分 + 1 = 15枠
  assertEquals(result.slots.length, 15);
  assertEquals(result.slots[0].start_at, toJstDate(DATE, "10:00:00").toISOString());
  assertEquals(result.slots.at(-1)!.start_at, toJstDate(DATE, "17:00:00").toISOString());
});

// ---- 最終受付時刻の境界値 ------------------------------------------------

Deno.test("generateSlots: 最終受付時刻ちょうどの枠は含まれる", () => {
  const result = generateSlots(baseParams());
  const hasLastReceptionSlot = result.slots.some(
    (s) => s.start_at === toJstDate(DATE, "17:00:00").toISOString(),
  );
  assertEquals(hasLastReceptionSlot, true);
});

Deno.test("generateSlots: 最終受付時刻を過ぎた枠(17:30)は含まれない", () => {
  const result = generateSlots(baseParams());
  const hasLateSlot = result.slots.some(
    (s) => s.start_at === toJstDate(DATE, "17:30:00").toISOString(),
  );
  assertEquals(hasLateSlot, false);
});

Deno.test("generateSlots: last_reception_timeが未設定(null)ならclose_timeが最終受付になる", () => {
  const result = generateSlots(
    baseParams({ businessDay: { ...OPEN_DAY, last_reception_time: null } }),
  );
  // 閉店18:00ちょうどに終わる17:30開始の枠までが最終
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "17:30:00").toISOString()), true);
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "18:00:00").toISOString()), false);
});

// ---- 施術時間が閉店時刻をまたぐケース --------------------------------------

Deno.test("generateSlots: 施術時間が閉店をまたぐ枠は除外される(90分メニュー、17:00開始→18:30終了)", () => {
  const result = generateSlots(baseParams({ durationMinutes: 90 }));
  const hasOverrunSlot = result.slots.some(
    (s) => s.start_at === toJstDate(DATE, "17:00:00").toISOString(),
  );
  assertEquals(hasOverrunSlot, false);
});

Deno.test("generateSlots: 施術時間がちょうど閉店時刻に収まる枠(90分、16:30開始→18:00終了)は含まれる", () => {
  const result = generateSlots(baseParams({ durationMinutes: 90 }));
  const hasBoundarySlot = result.slots.some(
    (s) => s.start_at === toJstDate(DATE, "16:30:00").toISOString(),
  );
  assertEquals(hasBoundarySlot, true);
});

// ---- シフトと営業時間の交差 -----------------------------------------------

Deno.test("generateSlots: シフトが営業時間より狭い場合はシフトの範囲に絞られる", () => {
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: "12:00:00", end_time: "14:00:00" }],
      ]),
    }),
  );
  assertEquals(result.slots[0].start_at, toJstDate(DATE, "12:00:00").toISOString());
  assertEquals(result.slots.at(-1)!.start_at, toJstDate(DATE, "13:30:00").toISOString());
});

Deno.test("generateSlots: シフト開始が営業開始より早くても営業時間側が優先される", () => {
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: "08:00:00", end_time: "12:00:00" }],
      ]),
    }),
  );
  assertEquals(result.slots[0].start_at, toJstDate(DATE, "10:00:00").toISOString());
});

Deno.test("generateSlots: シフトが実質ゼロ幅(start>=end)なら枠なし", () => {
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: "14:00:00", end_time: "13:00:00" }],
      ]),
    }),
  );
  assertEquals(result.slots, []);
});

Deno.test("generateSlots: シフトのstart_timeのみ設定(end_timeはnull)ならend側は営業時間依存", () => {
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: "15:00:00", end_time: null }],
      ]),
    }),
  );
  assertEquals(result.slots[0].start_at, toJstDate(DATE, "15:00:00").toISOString());
  assertEquals(result.slots.at(-1)!.start_at, toJstDate(DATE, "17:00:00").toISOString()); // 最終受付17:00まで
});

Deno.test("generateSlots: シフトのend_timeのみ設定(start_timeはnull)ならstart側は営業時間依存", () => {
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: null, end_time: "12:00:00" }],
      ]),
    }),
  );
  assertEquals(result.slots[0].start_at, toJstDate(DATE, "10:00:00").toISOString());
  assertEquals(result.slots.at(-1)!.start_at, toJstDate(DATE, "11:30:00").toISOString());
});

// ---- 休憩時間の除外 -------------------------------------------------------

Deno.test("generateSlots: 休憩時間に完全に含まれる枠は除外される", () => {
  // シフト10:00-18:00、休憩13:00-14:00。候補枠13:00は休憩とちょうど一致
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: null, end_time: null, break_start_time: "13:00:00", break_end_time: "14:00:00" }],
      ]),
    }),
  );
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "13:00:00").toISOString()), false);
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "13:30:00").toISOString()), false);
});

Deno.test("generateSlots: 施術時間が休憩に少しでもかかる枠(開始側)は除外される", () => {
  // 休憩13:00-14:00、90分メニューなら12:30開始→14:00終了で休憩開始とかぶる
  const result = generateSlots(
    baseParams({
      durationMinutes: 90,
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: null, end_time: null, break_start_time: "13:00:00", break_end_time: "14:00:00" }],
      ]),
    }),
  );
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "12:30:00").toISOString()), false);
});

Deno.test("generateSlots: 休憩に隣接するだけ(接するが重ならない)の枠は除外されない", () => {
  // 休憩13:00-14:00。候補枠12:30-13:00と14:00-14:30は接するだけで重ならない(半開区間)
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: null, end_time: null, break_start_time: "13:00:00", break_end_time: "14:00:00" }],
      ]),
    }),
  );
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "12:30:00").toISOString()), true);
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "14:00:00").toISOString()), true);
});

Deno.test("generateSlots: 休憩が未設定(null)なら通常どおり全枠が生成される", () => {
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: null, end_time: null, break_start_time: null, break_end_time: null }],
      ]),
    }),
  );
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "13:00:00").toISOString()), true);
});

Deno.test("generateSlots: 休憩時間はスタッフごとに独立に判定される", () => {
  const result = generateSlots(
    baseParams({
      staffList: [STAFF_A, STAFF_B],
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: null, end_time: null, break_start_time: "13:00:00", break_end_time: "14:00:00" }],
        [STAFF_B.id, fullDayShift(STAFF_B.id)],
      ]),
    }),
  );
  const thirteenOClockSlots = result.slots.filter((s) => s.start_at === toJstDate(DATE, "13:00:00").toISOString());
  // 13:00の枠はスタッフBのみ空いている(スタッフAは休憩中)
  assertEquals(thirteenOClockSlots.length, 1);
  assertEquals(thirteenOClockSlots[0].staff_id, STAFF_B.id);
});

// ---- シフト未登録・非稼働 -------------------------------------------------

Deno.test("generateSlots: シフト未登録のスタッフは対象外", () => {
  const result = generateSlots(baseParams({ shiftByStaff: new Map() }));
  assertEquals(result.slots, []);
});

Deno.test("generateSlots: is_working=falseのスタッフは対象外", () => {
  const result = generateSlots(
    baseParams({
      shiftByStaff: new Map([[STAFF_A.id, { staff_id: STAFF_A.id, is_working: false, start_time: null, end_time: null }]]),
    }),
  );
  assertEquals(result.slots, []);
});

// ---- 既存予約との重なり判定 -----------------------------------------------

Deno.test("generateSlots: 既存予約と完全一致する枠は除外される", () => {
  const start = toJstDate(DATE, "10:00:00");
  const end = addMinutes(start, 30);
  const result = generateSlots(baseParams({ bookedByStaff: new Map([[STAFF_A.id, [{ start, end }]]]) }));
  assertEquals(result.slots.some((s) => s.start_at === start.toISOString()), false);
});

Deno.test("generateSlots: 既存予約と部分的に重なる枠(開始側)は除外される", () => {
  // 既存予約 10:15-10:45。候補枠10:00-10:30は10:15-10:30で重なる
  const booked: BookedRange = { start: toJstDate(DATE, "10:15:00"), end: toJstDate(DATE, "10:45:00") };
  const result = generateSlots(baseParams({ bookedByStaff: new Map([[STAFF_A.id, [booked]]]) }));
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "10:00:00").toISOString()), false);
});

Deno.test("generateSlots: 既存予約に完全に含まれる枠は除外される", () => {
  // 既存予約(90分扱い) 10:00-12:00の中にある候補枠10:30-11:00
  const booked: BookedRange = { start: toJstDate(DATE, "10:00:00"), end: toJstDate(DATE, "12:00:00") };
  const result = generateSlots(baseParams({ bookedByStaff: new Map([[STAFF_A.id, [booked]]]) }));
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "10:30:00").toISOString()), false);
});

Deno.test("generateSlots: 既存予約に隣接するだけ(接するが重ならない)の枠は除外されない", () => {
  // 既存予約 10:00-10:30。候補枠10:30-11:00は接するだけで重ならない(半開区間)
  const booked: BookedRange = { start: toJstDate(DATE, "10:00:00"), end: toJstDate(DATE, "10:30:00") };
  const result = generateSlots(baseParams({ bookedByStaff: new Map([[STAFF_A.id, [booked]]]) }));
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "10:30:00").toISOString()), true);
  // 一方で予約枠自体(10:00開始)は除外される
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "10:00:00").toISOString()), false);
});

Deno.test("generateSlots: 同一スタッフに複数の既存予約がある場合、それぞれ独立に判定される", () => {
  const bookedList: BookedRange[] = [
    { start: toJstDate(DATE, "10:00:00"), end: toJstDate(DATE, "10:30:00") },
    { start: toJstDate(DATE, "14:00:00"), end: toJstDate(DATE, "14:30:00") },
  ];
  const result = generateSlots(baseParams({ bookedByStaff: new Map([[STAFF_A.id, bookedList]]) }));
  // 両方の予約枠が除外される
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "10:00:00").toISOString()), false);
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "14:00:00").toISOString()), false);
  // 間の枠(12:00)は両方の予約と重ならないので空いている
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "12:00:00").toISOString()), true);
});

Deno.test("generateSlots: スタッフごとの既存予約は他スタッフの空き枠に影響しない", () => {
  const result = generateSlots(
    baseParams({
      staffList: [STAFF_A, STAFF_B],
      shiftByStaff: new Map([
        [STAFF_A.id, fullDayShift(STAFF_A.id)],
        [STAFF_B.id, fullDayShift(STAFF_B.id)],
      ]),
      bookedByStaff: new Map([
        [STAFF_A.id, [{ start: toJstDate(DATE, "10:00:00"), end: toJstDate(DATE, "10:30:00") }]],
      ]),
    }),
  );
  const tenOClockSlots = result.slots.filter((s) => s.start_at === toJstDate(DATE, "10:00:00").toISOString());
  // 10:00の枠はスタッフBのみ空いている(スタッフAは予約済みで除外)
  assertEquals(tenOClockSlots.length, 1);
  assertEquals(tenOClockSlots[0].staff_id, STAFF_B.id);
});

Deno.test("generateSlots: staffListが空配列なら休業ではないが枠も0件", () => {
  const result = generateSlots(baseParams({ staffList: [], shiftByStaff: new Map() }));
  assertEquals(result.closed, false);
  assertEquals(result.slots, []);
});

Deno.test("overlaps: 半開区間の境界値を直接検証する", () => {
  const t = (h: string) => toJstDate(DATE, h);
  // 完全一致
  assertEquals(overlaps(t("10:00:00"), t("10:30:00"), t("10:00:00"), t("10:30:00")), true);
  // 隣接(接するだけ)は重ならない
  assertEquals(overlaps(t("10:00:00"), t("10:30:00"), t("10:30:00"), t("11:00:00")), false);
  assertEquals(overlaps(t("10:30:00"), t("11:00:00"), t("10:00:00"), t("10:30:00")), false);
  // 一部重なり
  assertEquals(overlaps(t("10:00:00"), t("10:30:00"), t("10:15:00"), t("10:45:00")), true);
  // 包含
  assertEquals(overlaps(t("10:00:00"), t("12:00:00"), t("10:30:00"), t("11:00:00")), true);
  assertEquals(overlaps(t("10:30:00"), t("11:00:00"), t("10:00:00"), t("12:00:00")), true);
});

// ---- 過去の枠の除外 -------------------------------------------------------

Deno.test("generateSlots: nowより前の枠は除外される", () => {
  const now = toJstDate(DATE, "10:45:00");
  const result = generateSlots(baseParams({ now }));
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "10:00:00").toISOString()), false);
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "10:30:00").toISOString()), false);
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "11:00:00").toISOString()), true);
});

Deno.test("generateSlots: nowがスロット開始時刻ちょうどなら含まれる(境界値)", () => {
  const now = toJstDate(DATE, "11:00:00");
  const result = generateSlots(baseParams({ now }));
  assertEquals(result.slots.some((s) => s.start_at === toJstDate(DATE, "11:00:00").toISOString()), true);
});

// ---- 複数スタッフ・ソート順 -----------------------------------------------

Deno.test("generateSlots: 複数スタッフの枠がstart_at→staff_idの順でソートされる", () => {
  const result = generateSlots(
    baseParams({
      staffList: [STAFF_B, STAFF_A], // 入力順はB,Aだが結果はstart_at優先、同時刻ならstaff_id昇順
      shiftByStaff: new Map([
        [STAFF_A.id, { staff_id: STAFF_A.id, is_working: true, start_time: "10:00:00", end_time: "10:30:00" }],
        [STAFF_B.id, { staff_id: STAFF_B.id, is_working: true, start_time: "10:00:00", end_time: "10:30:00" }],
      ]),
      durationMinutes: 30,
    }),
  );
  assertEquals(result.slots.length, 2);
  assertEquals(result.slots[0].staff_id, STAFF_A.id);
  assertEquals(result.slots[1].staff_id, STAFF_B.id);
});

Deno.test("generateSlots: 指名なし(複数スタッフ)で稼働なしのスタッフは結果に出ない", () => {
  const result = generateSlots(
    baseParams({
      staffList: [STAFF_A, STAFF_B],
      shiftByStaff: new Map([[STAFF_A.id, fullDayShift(STAFF_A.id)]]), // STAFF_Bはシフト未登録
    }),
  );
  assertEquals(result.slots.every((s) => s.staff_id === STAFF_A.id), true);
});
