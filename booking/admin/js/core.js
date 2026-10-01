// 管理画面の全タブが共通で使うもの(Supabaseクライアント・DOM参照・フォーマッタ・
// 画像アップロード・メニュー/スタッフ一覧のキャッシュ等)をまとめたモジュール。
// 他のjs/*.jsファイルはここからimportして使う(admin.jsが分割されたうちの1つ、
// 2026-09-29に機能ごとのファイルへ分割した際に切り出した)。

export const { SUPABASE_URL, ANON_KEY } = window.CITY_DOGS_CONFIG;

// 予約検索の1ページあたりの件数(config.jsのSEARCH_PAGE_SIZE。未指定・不正な値は30、APIの上限200まで)。
export const SEARCH_PAGE_SIZE = Math.min(Math.max(Math.floor(Number(window.CITY_DOGS_CONFIG.SEARCH_PAGE_SIZE)) || 30, 1), 200);

export const { createClient } = window.supabase;
export const client = createClient(SUPABASE_URL, ANON_KEY);

export const jstDateFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' });
export const jstTimeFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
export const yenFmt = new Intl.NumberFormat('ja-JP');

export const STATUS_META = {
  tentative: { label: '仮予約', pill: 'is-muted' },
  confirmed: { label: '確定', pill: 'is-progress' },
  in_service: { label: '施術中', pill: 'is-active' },
  awaiting_checkout: { label: '会計待ち', pill: 'is-active' },
  completed: { label: '完了', pill: 'is-done' },
  declined: { label: 'お断り', pill: 'is-danger' },
  cancelled_by_customer: { label: 'キャンセル(お客様)', pill: 'is-danger' },
  cancelled_by_salon: { label: 'キャンセル(サロン)', pill: 'is-danger' },
  no_show: { label: '無断キャンセル', pill: 'is-danger' },
  auto_cancelled: { label: '自動キャンセル', pill: 'is-muted' },
};
export const SOURCE_LABEL = { phone: '電話', web: 'WEB', hotpepper: 'HotPepper', walk_in: '飛び込み' };

// api-design.md「予約ステータスの状態遷移」表と同じ内容(admin-reservations/update.tsのSTATUS_TRANSITIONSと一致させる)。
// サーバー側で最終的に検証されるが、選べない遷移をそもそも選択肢に出さないためにクライアント側にも複製している。
export const STATUS_TRANSITIONS = {
  tentative: ['confirmed', 'declined', 'cancelled_by_customer', 'cancelled_by_salon', 'auto_cancelled'],
  confirmed: ['in_service', 'cancelled_by_customer', 'cancelled_by_salon', 'no_show'],
  in_service: ['awaiting_checkout'],
  awaiting_checkout: ['completed'],
  completed: [],
  declined: [],
  cancelled_by_customer: [],
  cancelled_by_salon: [],
  no_show: [],
  auto_cancelled: [],
};
export const REASON_REQUIRED_STATUSES = new Set(['declined', 'cancelled_by_salon', 'no_show']);

// メニューの区分(menus.category)。選択ルールはサーバー側 _shared/menuSelection.ts が最終防御:
// cut/color/limitedは各区分から最大1つ、permはパーマ・ツイストを併用可(複数)、この4区分のどれか1つは必須、optionは追加専用で何個でも可。
// limited(期間限定メニュー)はcut等と同じ主メニュー扱い(2026-10-01追加)。
export const MAIN_MENU_CATEGORIES = ['cut', 'limited', 'color', 'perm'];
export const SINGLE_SELECT_MENU_CATEGORIES = ['cut', 'color', 'limited'];
export const MENU_CATEGORY_ORDER = ['cut', 'limited', 'color', 'perm', 'option'];
export const MENU_CATEGORY_LABELS = { cut: 'カット', limited: '期間限定メニュー', color: 'カラー', perm: 'パーマ', option: 'オプション' };

// 電話番号の自動ハイフン・バリデーションはLPの予約画面(lp/reserve.js)と完全に同一仕様にする
// (2026-09-14に決定。携帯番号(090/080/070)限定で、固定電話からの代理予約登録はできない)。
export const PHONE_RE = /^0[789]0-?\d{4}-?\d{4}$/;

export function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function formatMenuPrice(price, isFrom) {
  return `¥${yenFmt.format(price)}${isFrom ? '〜' : ''}`;
}

// 予約の料金表示。会計金額が確定していればそれ(実際の金額)、未確定なら予約時点の金額(「〜」付きは下限)。
export function reservationPriceLabel(r) {
  if (r.final_price != null) return `¥${yenFmt.format(r.final_price)}`;
  return formatMenuPrice(r.price, r.price_is_from);
}

// 金額入力(全角数字・カンマ・「¥」「円」を許容)を整数に変換する。空欄はnull、不正な値はNaN。
export function parseYenInput(raw) {
  const normalized = String(raw ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[,，¥￥円\s]/g, '');
  if (normalized === '') return null;
  return /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthValueOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// "2026-09" のような月の値から、その月の全日付("YYYY-MM-DD")を列挙する。
export function monthDateRange(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateFrom = `${monthValue}-01`;
  const dateTo = `${monthValue}-${String(daysInMonth).padStart(2, '0')}`;
  const dates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(`${monthValue}-${String(day).padStart(2, '0')}`);
  }
  return { year, month, dateFrom, dateTo, dates };
}

export function dateLabelJp(dateStr) {
  return jstDateFmt.format(new Date(`${dateStr}T00:00:00+09:00`));
}

export const WEEKDAY_HEADERS_JA = ['日', '月', '火', '水', '木', '金', '土'];

// 月の最初の曜日に合わせて空セルを先頭に置き、通常のカレンダーのように並べる。
export function renderCalendarGrid(containerEl, dates, cellRenderer) {
  const firstDow = new Date(`${dates[0]}T00:00:00+09:00`).getDay();
  const headers = WEEKDAY_HEADERS_JA.map((w) => `<div class="calendar-weekday">${w}</div>`).join('');
  const leading = Array.from({ length: firstDow }, () => '<div class="calendar-day-empty"></div>').join('');
  const cells = dates.map(cellRenderer).join('');
  containerEl.innerHTML = headers + leading + cells;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function openModal(modalEl) { modalEl.hidden = false; }
export function closeModal(modalEl) { modalEl.hidden = true; }

// 引数名を"el"にすると、DOM参照まとめオブジェクト`el`をシャドーイングしてしまうため
// 意図的に別名にしている(この2関数の中でだけ通じる罠を作らないため)。
export function showFormError(errorEl, message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}
export function hideFormError(errorEl) {
  errorEl.hidden = true;
}

export function showSaveStatus(statusEl, message, ok) {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-ok', ok);
  statusEl.classList.toggle('is-error', !ok);
  setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('is-ok', 'is-error'); }, 3000);
}

// ---------------------------------------------------------------
// DOM参照(index.htmlのidと1:1対応。各タブのモジュールがここから必要な分だけ使う)
// ---------------------------------------------------------------

export const el = {
  loginScreen: document.getElementById('loginScreen'),
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginError: document.getElementById('loginError'),
  loginSubmit: document.getElementById('loginSubmit'),

  appScreen: document.getElementById('appScreen'),
  staffName: document.getElementById('staffName'),
  logoutBtn: document.getElementById('logoutBtn'),
  changePasswordBtn: document.getElementById('changePasswordBtn'),
  changePasswordModal: document.getElementById('changePasswordModal'),
  changePasswordForm: document.getElementById('changePasswordForm'),
  changePasswordError: document.getElementById('changePasswordError'),
  changePasswordStatus: document.getElementById('changePasswordStatus'),
  cpNewPassword: document.getElementById('cpNewPassword'),
  cpNewPasswordConfirm: document.getElementById('cpNewPasswordConfirm'),

  scheduleDate: document.getElementById('scheduleDate'),
  prevDay: document.getElementById('prevDay'),
  nextDay: document.getElementById('nextDay'),
  todayBtn: document.getElementById('todayBtn'),
  businessDayInfo: document.getElementById('businessDayInfo'),
  scheduleArea: document.getElementById('scheduleArea'),

  searchForm: document.getElementById('searchForm'),
  searchResultMeta: document.getElementById('searchResultMeta'),
  searchArea: document.getElementById('searchArea'),
  searchPager: document.getElementById('searchPager'),

  ratingForm: document.getElementById('ratingForm'),
  ratingScoreInput: document.getElementById('ratingScoreInput'),
  ratingCountInput: document.getElementById('ratingCountInput'),
  ratingSaveStatus: document.getElementById('ratingSaveStatus'),

  featureCards: document.getElementById('featureCards'),
  featureAddForm: document.getElementById('featureAddForm'),
  galleryCards: document.getElementById('galleryCards'),
  galleryAddForm: document.getElementById('galleryAddForm'),
  menuCards: document.getElementById('menuCards'),
  menuAddForm: document.getElementById('menuAddForm'),
  staffBioCards: document.getElementById('staffBioCards'),
  staffAddForm: document.getElementById('staffAddForm'),

  openCreateReservation: document.getElementById('openCreateReservation'),
  createReservationModal: document.getElementById('createReservationModal'),
  createReservationForm: document.getElementById('createReservationForm'),
  createReservationError: document.getElementById('createReservationError'),
  createReservationStatus: document.getElementById('createReservationStatus'),
  crPhone: document.getElementById('crPhone'),
  crMenu: document.getElementById('crMenu'),
  crExtrasField: document.getElementById('crExtrasField'),
  crExtras: document.getElementById('crExtras'),
  crMenuSummary: document.getElementById('crMenuSummary'),
  crStaff: document.getElementById('crStaff'),
  crDate: document.getElementById('crDate'),
  crSlot: document.getElementById('crSlot'),

  editReservationModal: document.getElementById('editReservationModal'),
  editReservationSummary: document.getElementById('editReservationSummary'),
  editStatusForm: document.getElementById('editStatusForm'),
  editStatusSelect: document.getElementById('editStatusSelect'),
  editStatusError: document.getElementById('editStatusError'),
  editStatusSaveStatus: document.getElementById('editStatusSaveStatus'),
  editStatusNoTransition: document.getElementById('editStatusNoTransition'),
  editReasonField: document.getElementById('editReasonField'),
  editReasonInput: document.getElementById('editReasonInput'),
  editFinalPriceField: document.getElementById('editFinalPriceField'),
  editFinalPriceInput: document.getElementById('editFinalPriceInput'),
  editFinalPriceRequired: document.getElementById('editFinalPriceRequired'),
  editFinalPriceHint: document.getElementById('editFinalPriceHint'),
  editCheckoutSection: document.getElementById('editCheckoutSection'),
  editCheckoutForm: document.getElementById('editCheckoutForm'),
  editCheckoutInput: document.getElementById('editCheckoutInput'),
  editCheckoutHint: document.getElementById('editCheckoutHint'),
  editCheckoutError: document.getElementById('editCheckoutError'),
  editCheckoutSaveStatus: document.getElementById('editCheckoutSaveStatus'),
  editRescheduleForm: document.getElementById('editRescheduleForm'),
  editRescheduleError: document.getElementById('editRescheduleError'),
  editRescheduleSaveStatus: document.getElementById('editRescheduleSaveStatus'),
  editStaffSelect: document.getElementById('editStaffSelect'),
  editDateInput: document.getElementById('editDateInput'),
  editSlotSelect: document.getElementById('editSlotSelect'),

  shiftsMonth: document.getElementById('shiftsMonth'),
  shiftsPrevMonth: document.getElementById('shiftsPrevMonth'),
  shiftsNextMonth: document.getElementById('shiftsNextMonth'),
  generateBusinessDays: document.getElementById('generateBusinessDays'),
  businessDaysGenerateStatus: document.getElementById('businessDaysGenerateStatus'),
  businessDaysCalendar: document.getElementById('businessDaysCalendar'),
  shiftsStaffSelect: document.getElementById('shiftsStaffSelect'),
  generateStaffShifts: document.getElementById('generateStaffShifts'),
  staffShiftsGenerateStatus: document.getElementById('staffShiftsGenerateStatus'),
  staffShiftsCalendar: document.getElementById('staffShiftsCalendar'),

  businessDayModal: document.getElementById('businessDayModal'),
  businessDayModalTitle: document.getElementById('businessDayModalTitle'),
  businessDayForm: document.getElementById('businessDayForm'),
  businessDayError: document.getElementById('businessDayError'),
  businessDaySaveStatus: document.getElementById('businessDaySaveStatus'),
  bdOpen: document.getElementById('bdOpen'),
  bdOpenTime: document.getElementById('bdOpenTime'),
  bdCloseTime: document.getElementById('bdCloseTime'),
  bdLastReception: document.getElementById('bdLastReception'),
  bdNote: document.getElementById('bdNote'),

  staffShiftModal: document.getElementById('staffShiftModal'),
  staffShiftModalTitle: document.getElementById('staffShiftModalTitle'),
  staffShiftForm: document.getElementById('staffShiftForm'),
  staffShiftError: document.getElementById('staffShiftError'),
  staffShiftSaveStatus: document.getElementById('staffShiftSaveStatus'),
  ssWorking: document.getElementById('ssWorking'),
  ssStart: document.getElementById('ssStart'),
  ssEnd: document.getElementById('ssEnd'),
  ssBreakStart: document.getElementById('ssBreakStart'),
  ssBreakEnd: document.getElementById('ssBreakEnd'),
  ssNote: document.getElementById('ssNote'),

  customerSearchForm: document.getElementById('customerSearchForm'),
  customerResultMeta: document.getElementById('customerResultMeta'),
  customerCards: document.getElementById('customerCards'),

  revenueMonth: document.getElementById('revenueMonth'),
  revenuePrevMonth: document.getElementById('revenuePrevMonth'),
  revenueNextMonth: document.getElementById('revenueNextMonth'),
  revenueTotal: document.getElementById('revenueTotal'),
  revenueArea: document.getElementById('revenueArea'),
};

// ---------------------------------------------------------------
// API
// ---------------------------------------------------------------

export class ApiClientError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export async function apiFetch(functionName, path, options = {}) {
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new ApiClientError('ログインが必要です。');

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiClientError('通信エラーが発生しました。');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiClientError(body?.error?.message || 'エラーが発生しました。', body?.error?.code);
  }
  return body;
}

// ---------------------------------------------------------------
// メニュー・スタッフ一覧(複数タブが参照するキャッシュ)
// ---------------------------------------------------------------

let menuOptionsCache = null;
let staffOptionsCache = null;

export async function loadMenuOptions() {
  if (!menuOptionsCache) {
    const data = await apiFetch('menus', '');
    menuOptionsCache = data.menus;
  }
  return menuOptionsCache;
}

export function getCachedMenuOptions() {
  return menuOptionsCache;
}

export async function loadStaffOptions() {
  if (!staffOptionsCache) {
    const data = await apiFetch('staff', '');
    staffOptionsCache = data.staff;
  }
  return staffOptionsCache;
}

export function getCachedStaffOptions() {
  return staffOptionsCache;
}

// メニュー・担当・日付から実際の空き枠を取得する(公開の GET /availability を利用)。
// 開始時刻を自由入力にすると、30分刻みの実際の枠と一致しない時刻(例: 11:15)を
// 送信したときに「その時刻の枠自体が存在しない」だけなのに「空きがない」と同じ
// エラーになり紛らわしい不具合があったため、予約画面(reserve.js)と同様に
// 必ず実際の枠一覧から選ばせる方式にしている。
// menuSpec: { menuIds: [...] }(選んだメニュー。所要時間は合計で計算される) か
// { durationMinutes }(既存予約のリスケジュール用。予約時点のメニューが後から非公開になっていても動く)。
export async function fetchAvailabilitySlots(menuSpec, staffId, date, excludeReservationId) {
  const params = new URLSearchParams({ date });
  if (menuSpec.durationMinutes) params.set('duration_minutes', String(menuSpec.durationMinutes));
  else params.set('menu_ids', menuSpec.menuIds.join(','));
  if (staffId) params.set('staff_id', staffId);
  if (excludeReservationId) params.set('exclude_reservation_id', excludeReservationId);
  return apiFetch('availability', `?${params.toString()}`);
}

// 担当スタイリストの指定は必須(2026-09-18〜、「指名なし」は廃止)なので、
// 空き枠は常に1名分だけが返ってくる(値はstart_atのISO文字列)。
export function renderSlotOptions(selectEl, data) {
  if (!data || data.reason === 'closed') {
    selectEl.innerHTML = '<option value="">休業日です</option>';
    return;
  }
  if (!data.slots || data.slots.length === 0) {
    selectEl.innerHTML = '<option value="">空き枠がありません</option>';
    return;
  }
  const options = data.slots.map(
    (slot) => `<option value="${slot.start_at}">${escapeHtml(jstTimeFmt.format(new Date(slot.start_at)))}</option>`,
  );
  selectEl.innerHTML = '<option value="">選択してください</option>' + options.join('');
}

// ---------------------------------------------------------------
// LPコンテンツ(ギャラリー写真・スタッフアバター)向けの画像アップロード。
// Storageバケットは公開読み取り・書き込みは稼働中スタッフのみ(0010_site_images_storage.sql参照)。
// Edge Functionを経由せず、ログイン済みclientから直接Supabase Storageへアップロードする
// (image_url/avatar_image_urlはただのtext列で形式検証もないため、ここで得た公開URLを
// 既存のテキスト欄にそのまま入れれば、保存フロー自体は一切変更不要)。
// ---------------------------------------------------------------

const SITE_IMAGES_BUCKET = 'site-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadSiteImage(file, folder) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('対応していない画像形式です(jpg/png/webp/gifのみ)。');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('画像サイズが大きすぎます(5MBまで)。');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage.from(SITE_IMAGES_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// 差し替え・削除で不要になった画像を後片付けする(失敗しても保存本体は成立させたいので
// ベストエフォート。このバケットの画像でなければ何もしない)。
export function deleteSiteImageIfOwned(url) {
  if (!url) return;
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/${SITE_IMAGES_BUCKET}/`;
  if (!url.startsWith(prefix)) return;
  const path = url.slice(prefix.length);
  client.storage.from(SITE_IMAGES_BUCKET).remove([path]).catch(() => {});
}

// lp/images/配下を指す既存データ(相対パス)は、別オリジンの管理画面からは実体を
// 参照できない(admin/images/には同じファイルが無い)。blob:URL(アップロード直後の
// ローカルプレビュー)やStorageの公開URL(絶対URL)は問題なく表示できる。
export function isPreviewableUrl(url) {
  return /^(https?:|blob:)/i.test(url);
}

// プレビュー枠の中身のHTMLを組み立てる(初期レンダリング時のテンプレート文字列と
// アップロード後の動的更新の両方から使う共通ロジック)。
export function previewInnerHtml(url, placeholderText = '画像未選択') {
  if (url && isPreviewableUrl(url)) return `<img src="${escapeHtml(url)}" alt="">`;
  if (url) return '<span class="no-image-text">既存の相対パス画像です(この画面ではプレビューできません。LP上の表示でご確認ください)</span>';
  return placeholderText ? `<span class="no-image-text">${escapeHtml(placeholderText)}</span>` : '';
}

// プレビュー枠(.image-preview-box等)の中身を、画像URLの有無に応じて描画する。
export function renderImagePreview(previewBox, url, placeholderText = '画像未選択') {
  if (!previewBox) return;
  previewBox.innerHTML = previewInnerHtml(url, placeholderText);
}

// ファイル選択時に即アップロードし、結果のURLを対象のテキスト欄へ反映する共通ハンドラ。
// previewBoxを渡した場合、選択直後はローカルファイルをそのまま(アップロード完了を待たず)
// プレビュー表示し、アップロード完了後に最終的な公開URLへの表示に切り替える。
export function wireImageFileInput(fileInput, urlInput, folder, previewBox, placeholderText = '画像未選択') {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const originalValue = urlInput.value;
    if (previewBox) {
      renderImagePreview(previewBox, URL.createObjectURL(file), placeholderText);
      previewBox.classList.add('is-uploading');
    }
    urlInput.disabled = true;
    urlInput.value = 'アップロード中…';
    try {
      const uploadedUrl = await uploadSiteImage(file, folder);
      urlInput.value = uploadedUrl;
      if (previewBox) renderImagePreview(previewBox, uploadedUrl, placeholderText);
    } catch (err) {
      alert(`画像のアップロードに失敗しました: ${err.message}`);
      urlInput.value = originalValue;
      if (previewBox) renderImagePreview(previewBox, originalValue, placeholderText);
    } finally {
      urlInput.disabled = false;
      fileInput.value = '';
      if (previewBox) previewBox.classList.remove('is-uploading');
    }
  });
}
