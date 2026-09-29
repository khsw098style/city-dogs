// 電話予約の代理登録・予約編集(ステータス変更・会計金額・リスケジュール)。
// 「スケジュール」「予約検索」どちらのタブからも開けるモーダルなので、
// 単独のファイルに切り出している(2026-09-29、admin.js分割時)。

import {
  el, apiFetch, escapeHtml, openModal, closeModal, showFormError, hideFormError, showSaveStatus,
  formatDateLocal, formatMenuPrice, reservationPriceLabel, parseYenInput, PHONE_RE, formatPhoneNumber,
  jstDateFmt, jstTimeFmt, STATUS_META, STATUS_TRANSITIONS, REASON_REQUIRED_STATUSES,
  MAIN_MENU_CATEGORIES, SINGLE_SELECT_MENU_CATEGORIES, MENU_CATEGORY_ORDER, MENU_CATEGORY_LABELS,
  loadMenuOptions, loadStaffOptions, getCachedMenuOptions, getCachedStaffOptions,
  fetchAvailabilitySlots, renderSlotOptions,
} from './core.js';
import { loadSchedule } from './schedule.js';
import { runSearch } from './search.js';

// 初回ログイン時に1度だけ配線する(モーダル本体・フォーム類はページに常時存在するため)。
export function wireReservationModals() {
  // モーダル(代理予約登録・予約編集)の閉じ方は×ボタンのみにしている。
  // 背景クリックで閉じる方式だと、入力中に少し外側をクリックしただけで
  // フォームの内容ごと消えてしまう事故につながるため、意図的に採用していない。
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(document.getElementById(btn.dataset.closeModal)));
  });

  el.openCreateReservation.addEventListener('click', openCreateReservationModal);
  el.createReservationForm.addEventListener('submit', submitCreateReservation);
  el.crPhone.addEventListener('input', () => {
    const wasAtEnd = el.crPhone.selectionStart === el.crPhone.value.length;
    el.crPhone.value = formatPhoneNumber(el.crPhone.value);
    if (wasAtEnd) {
      const len = el.crPhone.value.length;
      el.crPhone.setSelectionRange(len, len);
    }
  });
  el.crMenu.addEventListener('change', onCreateMenuChange);
  el.crExtras.addEventListener('change', onCreateExtrasChange);
  el.crStaff.addEventListener('change', refreshCreateSlots);
  el.crDate.addEventListener('change', refreshCreateSlots);

  el.editStatusForm.addEventListener('submit', submitStatusChange);
  el.editRescheduleForm.addEventListener('submit', submitReschedule);
  el.editCheckoutForm.addEventListener('submit', submitCheckout);
  el.editStatusSelect.addEventListener('change', () => {
    el.editFinalPriceField.hidden = el.editStatusSelect.value !== 'completed';
    el.editReasonField.hidden = !REASON_REQUIRED_STATUSES.has(el.editStatusSelect.value);
  });
  el.editStaffSelect.addEventListener('change', refreshEditSlots);
  el.editDateInput.addEventListener('change', refreshEditSlots);
}

// ---------------------------------------------------------------
// 電話予約の代理登録
// ---------------------------------------------------------------

// 電話予約登録モーダルで選択中のメニューID(主メニュー+チェックした追加メニュー)。
function getCreateMenuIds() {
  const mainId = el.crMenu.value;
  if (!mainId) return [];
  const extras = [...el.crExtras.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
  return [mainId, ...extras];
}

// 主メニューを選ぶと、追加できるメニュー(同じ区分以外)をチェックボックスで表示する。
function renderCreateExtras() {
  const mainId = el.crMenu.value;
  const menus = getCachedMenuOptions() ?? [];
  const main = menus.find((m) => m.id === mainId);
  if (!main) {
    el.crExtras.innerHTML = '';
    el.crExtrasField.hidden = true;
    return;
  }
  const mainCategory = main.category ?? 'cut';
  const extras = menus
    .filter((m) => m.id !== mainId && !(SINGLE_SELECT_MENU_CATEGORIES.includes(mainCategory) && (m.category ?? 'cut') === mainCategory))
    .sort((a, b) => MENU_CATEGORY_ORDER.indexOf(a.category ?? 'cut') - MENU_CATEGORY_ORDER.indexOf(b.category ?? 'cut'));
  el.crExtras.innerHTML = extras.map((m) => `
    <label><input type="checkbox" value="${m.id}" data-category="${m.category ?? 'cut'}"> ${escapeHtml(m.name)}(${formatMenuPrice(m.price, m.price_is_from)}・${m.duration_minutes}分)</label>
  `).join('');
  el.crExtrasField.hidden = extras.length === 0;
}

function updateCreateMenuSummary() {
  const ids = getCreateMenuIds();
  if (ids.length === 0) {
    el.crMenuSummary.hidden = true;
    return;
  }
  const selected = (getCachedMenuOptions() ?? []).filter((m) => ids.includes(m.id));
  const price = selected.reduce((sum, m) => sum + m.price, 0);
  const minutes = selected.reduce((sum, m) => sum + m.duration_minutes, 0);
  const isFrom = selected.some((m) => m.price_is_from);
  el.crMenuSummary.hidden = false;
  el.crMenuSummary.textContent = `合計 ${formatMenuPrice(price, isFrom)} ・ 所要 約${minutes}分`;
}

function onCreateMenuChange() {
  renderCreateExtras();
  updateCreateMenuSummary();
  refreshCreateSlots();
}

function onCreateExtrasChange(e) {
  // カット・カラーは同じ区分から1つまで。選び直したら同区分の他のチェックを外す(パーマ・ツイストは併用可)。
  const changed = e.target;
  if (changed.checked && SINGLE_SELECT_MENU_CATEGORIES.includes(changed.dataset.category)) {
    el.crExtras.querySelectorAll(`input[data-category="${changed.dataset.category}"]`).forEach((c) => {
      if (c !== changed) c.checked = false;
    });
  }
  updateCreateMenuSummary();
  refreshCreateSlots();
}

// メニュー→日付のように立て続けに変更されると、それぞれの変更が非同期の空き枠取得を
// 呼ぶため、後の変更(例: 日付変更)によるリクエストより前の変更(例: メニュー変更時点、
// まだ古い日付)によるリクエストの応答が遅れて返ってくることがある。ガード無しだと
// 古い応答が新しい応答を上書きしてしまい、選んだはずの日付と違う枠が表示される
// (実機で「意図した+14日後ではなく今日の枠で予約が作られる」形で実際に発生した不具合)。
// 呼び出しごとに増分するトークンを持たせ、自分より後に呼ばれたリクエストが完了済みなら
// (=自分は最新ではない)結果を反映せずに捨てる。
let createSlotsRequestId = 0;

async function refreshCreateSlots() {
  const menuIds = getCreateMenuIds();
  const date = el.crDate.value;
  const staffId = el.crStaff.value;
  if (menuIds.length === 0 || !date) {
    el.crSlot.innerHTML = '<option value="">メニュー・日付を選択すると表示されます</option>';
    return;
  }
  if (!staffId) {
    el.crSlot.innerHTML = '<option value="">担当スタイリストを選択すると表示されます</option>';
    return;
  }
  const requestId = ++createSlotsRequestId;
  el.crSlot.innerHTML = '<option value="">読み込み中…</option>';
  try {
    const data = await fetchAvailabilitySlots({ menuIds }, staffId, date);
    if (requestId !== createSlotsRequestId) return; // 自分より新しいリクエストが既に走っているので破棄
    renderSlotOptions(el.crSlot, data);
  } catch (err) {
    if (requestId !== createSlotsRequestId) return;
    el.crSlot.innerHTML = '<option value="">取得に失敗しました</option>';
    showFormError(el.createReservationError, `空き枠の取得に失敗しました: ${err.message}`);
  }
}

async function openCreateReservationModal() {
  el.createReservationForm.reset();
  hideFormError(el.createReservationError);
  el.crDate.value = el.scheduleDate.value || formatDateLocal(new Date());
  el.crMenu.innerHTML = '<option value="">読み込み中…</option>';
  el.crExtras.innerHTML = '';
  el.crExtrasField.hidden = true;
  el.crMenuSummary.hidden = true;
  el.crSlot.innerHTML = '<option value="">メニュー・日付を選択すると表示されます</option>';
  openModal(el.createReservationModal);

  try {
    const [menus, staff] = await Promise.all([loadMenuOptions(), loadStaffOptions()]);
    el.crMenu.innerHTML = '<option value="">選択してください</option>' + MAIN_MENU_CATEGORIES
      .map((category) => {
        const options = menus
          .filter((m) => (m.category ?? 'cut') === category)
          .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}(${formatMenuPrice(m.price, m.price_is_from)})</option>`)
          .join('');
        return options ? `<optgroup label="${MENU_CATEGORY_LABELS[category]}">${options}</optgroup>` : '';
      })
      .join('');
    el.crStaff.innerHTML = '<option value="" disabled selected>選択してください</option>' +
      staff.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  } catch (err) {
    showFormError(el.createReservationError, `メニュー・スタッフ一覧の取得に失敗しました: ${err.message}`);
  }
}

async function submitCreateReservation(e) {
  e.preventDefault();
  hideFormError(el.createReservationError);

  const phone = el.crPhone.value.trim();
  if (!PHONE_RE.test(phone)) {
    showFormError(el.createReservationError, '電話番号の形式が正しくありません(例: 090-1234-5678)。');
    return;
  }
  if (!el.crStaff.value) {
    showFormError(el.createReservationError, '担当スタイリストを選択してください。');
    return;
  }
  if (!el.crSlot.value) {
    showFormError(el.createReservationError, '開始時刻を選択してください。');
    return;
  }

  const submitBtn = el.createReservationForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const result = await apiFetch('admin-reservations', '', {
      method: 'POST',
      body: {
        customer: {
          name: document.getElementById('crName').value.trim(),
          phone,
          email: document.getElementById('crEmail').value.trim() || null,
        },
        menu_ids: getCreateMenuIds(),
        staff_id: el.crStaff.value,
        start_at: el.crSlot.value,
        notes: document.getElementById('crNotes').value.trim(),
      },
    });
    closeModal(el.createReservationModal);
    el.scheduleDate.value = el.crDate.value;
    await loadSchedule();
    showSaveStatus(el.createReservationStatus, `予約番号 ${result.reservation_number} を登録しました`, true);
  } catch (err) {
    showFormError(el.createReservationError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------------------------------------------------------------
// 予約の編集(ステータス変更・リスケジュール)
// ---------------------------------------------------------------

let editingReservation = null; // { id, reservation_number, staff_id, start_at, status, ... }

// 会計金額の入力欄(「会計完了」への変更時と、完了後の修正用)を予約に合わせて初期化する。
// 「〜」付きメニューを含む予約は下限価格が入っているだけなので、誤って下限のまま保存しないよう空欄から始めて必須にする。
// 「〜」なしの予約は予約時点の金額を初期値にする(値引き等があれば修正)。
function setupFinalPriceInputs(reservation) {
  const isFrom = Boolean(reservation.price_is_from);
  const initial = reservation.final_price != null ? reservation.final_price : (isFrom ? '' : reservation.price);
  const bookedLabel = formatMenuPrice(reservation.price, isFrom);
  const hint = isFrom
    ? `予約時点の金額は ${bookedLabel}(下限)です。実際にいただいた金額を入力してください。`
    : `予約時点の金額は ${bookedLabel} です。値引きなどで変わる場合は修正してください。`;

  el.editFinalPriceInput.value = initial === '' ? '' : String(initial);
  el.editFinalPriceRequired.textContent = isFrom ? '(必須)' : '';
  el.editFinalPriceHint.textContent = hint;
  el.editFinalPriceField.hidden = true;

  const isCompleted = reservation.status === 'completed';
  el.editCheckoutSection.hidden = !isCompleted;
  hideFormError(el.editCheckoutError);
  el.editCheckoutSaveStatus.textContent = '';
  el.editCheckoutInput.value = initial === '' ? '' : String(initial);
  el.editCheckoutHint.textContent = reservation.final_price != null
    ? `保存済みの会計金額です。予約時点の金額は ${bookedLabel} でした。`
    : (isFrom ? `会計金額が未入力です(売上実績は下限の ${bookedLabel} で集計されています)。実際の金額を入力してください。` : hint);
}

export function openEditReservationModal(reservation) {
  editingReservation = reservation;
  const start = new Date(reservation.start_at);

  el.editReservationSummary.innerHTML = `
    <dt>予約番号</dt><dd>${escapeHtml(reservation.reservation_number)}</dd>
    <dt>お客様</dt><dd>${escapeHtml(reservation.customer?.name ?? '(顧客不明)')} ${escapeHtml(reservation.customer?.phone ?? '')}</dd>
    <dt>メニュー</dt><dd>${escapeHtml(reservation.menu_name ?? '')}</dd>
    <dt>料金</dt><dd>${reservationPriceLabel(reservation)}${reservation.final_price != null ? '(会計金額)' : ''}</dd>
    <dt>現在の日時</dt><dd>${jstDateFmt.format(start)} ${jstTimeFmt.format(start)}</dd>
    <dt>現在のステータス</dt><dd>${(STATUS_META[reservation.status] || {}).label ?? reservation.status}</dd>
  `;

  hideFormError(el.editStatusError);
  hideFormError(el.editRescheduleError);
  el.editReasonField.hidden = true;
  el.editReasonInput.value = '';
  setupFinalPriceInputs(reservation);

  const nextStatuses = STATUS_TRANSITIONS[reservation.status] ?? [];
  if (nextStatuses.length === 0) {
    el.editStatusForm.hidden = true;
    el.editStatusNoTransition.hidden = false;
  } else {
    el.editStatusForm.hidden = false;
    el.editStatusNoTransition.hidden = true;
    el.editStatusSelect.innerHTML = nextStatuses
      .map((s) => `<option value="${s}">${(STATUS_META[s] || {}).label ?? s}</option>`)
      .join('');
    el.editReasonField.hidden = !REASON_REQUIRED_STATUSES.has(el.editStatusSelect.value);
    el.editFinalPriceField.hidden = el.editStatusSelect.value !== 'completed';
  }

  el.editStaffSelect.innerHTML =
    (getCachedStaffOptions() ?? []).map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  el.editStaffSelect.value = reservation.staff_id ?? '';
  el.editDateInput.value = formatDateLocal(start);

  openModal(el.editReservationModal);
  refreshEditSlots();

  // スタッフ選択肢が未取得(検索タブから直接開いた等)ならここで読み込んでから選択し直す
  if (!getCachedStaffOptions()) {
    loadStaffOptions().then((staff) => {
      el.editStaffSelect.innerHTML =
        staff.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      el.editStaffSelect.value = reservation.staff_id ?? '';
      refreshEditSlots();
    }).catch(() => { /* 失敗しても現在の担当のままリスケジュールしなければ問題ない */ });
  }
}

// リスケジュール用の開始時刻の選択肢を取得する。exclude_reservation_idでこの予約自身の
// 枠を空き判定から除外してもらう(担当・日付を変えていない場合、自分自身とぶつかって
// 除外されるのを防ぐため)。
// refreshCreateSlots()と同じ理由(古いリクエストの応答が新しいリクエストより遅れて
// 返ってくることがある)でトークンによる後勝ちガードを入れている。
let editSlotsRequestId = 0;

async function refreshEditSlots() {
  if (!editingReservation) return;
  const staffId = el.editStaffSelect.value;
  const date = el.editDateInput.value;
  if (!date) {
    el.editSlotSelect.innerHTML = '<option value="">来店日を選択してください</option>';
    return;
  }
  const requestId = ++editSlotsRequestId;
  el.editSlotSelect.innerHTML = '<option value="">読み込み中…</option>';
  try {
    // exclude_reservation_idでこの予約自身の枠を空き判定から除外してもらうので、
    // 「今使っている枠」を自前で選択肢に補完する必要はない(休憩・営業時間の変更も
    // そのまま反映される。以前はここを手動で補完していたため、後から休憩を設定しても
    // 現在の枠が選択肢に残り続けてしまう不具合があった)。
    // 所要時間は予約時点の合計(現在の開始〜終了の長さ)をそのまま使う。複数メニューの内訳を引き直さず、
    // 予約後にメニューが非公開・改定されていても日時変更できる。
    const durationMinutes = Math.round(
      (new Date(editingReservation.end_at).getTime() - new Date(editingReservation.start_at).getTime()) / 60000,
    );
    const data = await fetchAvailabilitySlots({ durationMinutes }, staffId, date, editingReservation.id);
    if (requestId !== editSlotsRequestId) return; // 自分より新しいリクエストが既に走っているので破棄
    renderSlotOptions(el.editSlotSelect, data);
    const isSameContext = date === formatDateLocal(new Date(editingReservation.start_at))
      && staffId === (editingReservation.staff_id ?? '');
    if (isSameContext) el.editSlotSelect.value = editingReservation.start_at;
  } catch (err) {
    if (requestId !== editSlotsRequestId) return;
    el.editSlotSelect.innerHTML = '<option value="">取得に失敗しました</option>';
    showFormError(el.editRescheduleError, `空き枠の取得に失敗しました: ${err.message}`);
  }
}

async function submitStatusChange(e) {
  e.preventDefault();
  hideFormError(el.editStatusError);
  const status = el.editStatusSelect.value;
  const reason = el.editReasonInput.value.trim();
  if (REASON_REQUIRED_STATUSES.has(status) && !reason) {
    showFormError(el.editStatusError, 'この変更には理由の入力が必要です。');
    return;
  }

  // 会計完了にする時は実際の会計金額を送る(「〜」付きメニューを含む予約は入力必須。サーバー側でも検証する)。
  let finalPrice;
  if (status === 'completed') {
    const parsed = parseYenInput(el.editFinalPriceInput.value);
    if (Number.isNaN(parsed)) {
      showFormError(el.editStatusError, '会計金額は数字で入力してください。');
      return;
    }
    if (parsed === null && editingReservation.price_is_from) {
      showFormError(el.editStatusError, '「〜」付きのメニューを含む予約のため、実際の会計金額の入力が必要です。');
      return;
    }
    if (parsed !== null) finalPrice = parsed;
  }

  const submitBtn = el.editStatusForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await apiFetch('admin-reservations', `/${editingReservation.id}`, {
      method: 'PATCH',
      body: { status, cancel_reason: reason || undefined, final_price: finalPrice },
    });
    showSaveStatus(el.editStatusSaveStatus, '変更しました', true);
    closeModal(el.editReservationModal);
    await refreshCurrentView();
  } catch (err) {
    showFormError(el.editStatusError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function submitCheckout(e) {
  e.preventDefault();
  hideFormError(el.editCheckoutError);
  const parsed = parseYenInput(el.editCheckoutInput.value);
  if (parsed === null || Number.isNaN(parsed)) {
    showFormError(el.editCheckoutError, '会計金額を数字で入力してください。');
    return;
  }
  const submitBtn = el.editCheckoutForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await apiFetch('admin-reservations', `/${editingReservation.id}`, { method: 'PATCH', body: { final_price: parsed } });
    showSaveStatus(el.editCheckoutSaveStatus, '保存しました', true);
    closeModal(el.editReservationModal);
    await refreshCurrentView();
  } catch (err) {
    showFormError(el.editCheckoutError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function submitReschedule(e) {
  e.preventDefault();
  hideFormError(el.editRescheduleError);
  if (!el.editStaffSelect.value || !el.editDateInput.value || !el.editSlotSelect.value) {
    showFormError(el.editRescheduleError, '担当スタイリスト・来店日・開始時刻を選択してください。');
    return;
  }

  const submitBtn = el.editRescheduleForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await apiFetch('admin-reservations', `/${editingReservation.id}`, {
      method: 'PATCH',
      body: { staff_id: el.editStaffSelect.value, start_at: el.editSlotSelect.value },
    });
    showSaveStatus(el.editRescheduleSaveStatus, '変更しました', true);
    closeModal(el.editReservationModal);
    await refreshCurrentView();
  } catch (err) {
    showFormError(el.editRescheduleError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

// 予約の編集モーダルは「スケジュール」「予約検索」どちらからも開けるため、
// 変更後は今アクティブなタブの一覧を再読み込みする。
async function refreshCurrentView() {
  const activeTab = document.querySelector('.tab-btn.is-active')?.dataset.tab;
  if (activeTab === 'search') {
    await runSearch({ keepPosition: true });
  } else {
    await loadSchedule();
  }
}
