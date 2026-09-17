(() => {
  'use strict';

  const { SUPABASE_URL, ANON_KEY, TURNSTILE_SITE_KEY } = window.CITY_DOGS_CONFIG;

  const { createClient } = window.supabase;
  const client = createClient(SUPABASE_URL, ANON_KEY);

  // Cloudflare Turnstile(ログイン総当たり対策)。lp/js/reserve.jsと同じ仕組み。
  // index.html側でrender=explicitを指定しており、スクリプト読み込み完了時にこの
  // コールバックが呼ばれてから明示的にウィジェットを描画する。
  let turnstileToken = null;
  let turnstileWidgetId = null;
  window.onTurnstileLoad = function () {
    turnstileWidgetId = turnstile.render('#turnstileWidget', {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = null; },
      'error-callback': () => { turnstileToken = null; },
    });
  };

  const jstDateFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' });
  const jstTimeFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
  const yenFmt = new Intl.NumberFormat('ja-JP');

  const STATUS_META = {
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
  const SOURCE_LABEL = { phone: '電話', web: 'WEB', hotpepper: 'HotPepper', walk_in: '飛び込み' };

  // api-design.md「予約ステータスの状態遷移」表と同じ内容(admin-reservations/update.tsのSTATUS_TRANSITIONSと一致させる)。
  // サーバー側で最終的に検証されるが、選べない遷移をそもそも選択肢に出さないためにクライアント側にも複製している。
  const STATUS_TRANSITIONS = {
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
  const REASON_REQUIRED_STATUSES = new Set(['declined', 'cancelled_by_salon', 'no_show']);

  // 電話番号の自動ハイフン・バリデーションはLPの予約画面(lp/reserve.js)と完全に同一仕様にする
  // (2026-09-14に決定。携帯番号(090/080/070)限定で、固定電話からの代理予約登録はできない)。
  const PHONE_RE = /^0[789]0-?\d{4}-?\d{4}$/;

  function formatPhoneNumber(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  const el = {
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
  };

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------

  class ApiClientError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }

  async function apiFetch(functionName, path, options = {}) {
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
  // Auth
  // ---------------------------------------------------------------

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();

    if (!turnstileToken) {
      showLoginError('ロボットでないことの確認が完了していません。少し待ってから再度お試しください。');
      return;
    }

    el.loginSubmit.disabled = true;
    el.loginSubmit.textContent = 'ログイン中…';

    const { error } = await client.auth.signInWithPassword({
      email: el.loginEmail.value.trim(),
      password: el.loginPassword.value,
      options: { captchaToken: turnstileToken },
    });

    el.loginSubmit.disabled = false;
    el.loginSubmit.textContent = 'ログイン';

    // Turnstileのトークンは1回使うと無効になるため、成功/失敗にかかわらずリセットする
    if (turnstileWidgetId !== null) {
      turnstile.reset(turnstileWidgetId);
      turnstileToken = null;
    }

    if (error) {
      showLoginError('メールアドレスまたはパスワードが正しくありません。');
    }
    // 成功時は onAuthStateChange 側で画面切り替えする
  });

  el.logoutBtn.addEventListener('click', async () => {
    await client.auth.signOut();
  });

  el.changePasswordBtn.addEventListener('click', () => {
    el.changePasswordForm.reset();
    hideChangePasswordError();
    el.changePasswordStatus.textContent = '';
    openModal(el.changePasswordModal);
  });

  el.changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideChangePasswordError();

    if (el.cpNewPassword.value !== el.cpNewPasswordConfirm.value) {
      showChangePasswordError('新しいパスワードが一致しません。');
      return;
    }

    const submitBtn = el.changePasswordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    el.changePasswordStatus.textContent = '変更中…';

    const { error } = await client.auth.updateUser({ password: el.cpNewPassword.value });

    submitBtn.disabled = false;
    if (error) {
      el.changePasswordStatus.textContent = '';
      showChangePasswordError(error.message || 'パスワードの変更に失敗しました。');
      return;
    }

    el.changePasswordStatus.textContent = '変更しました。';
    setTimeout(() => closeModal(el.changePasswordModal), 1200);
  });

  function showChangePasswordError(msg) {
    el.changePasswordError.textContent = msg;
    el.changePasswordError.hidden = false;
  }
  function hideChangePasswordError() {
    el.changePasswordError.hidden = true;
  }

  function showLoginError(msg) {
    el.loginError.textContent = msg;
    el.loginError.hidden = false;
  }
  function hideLoginError() {
    el.loginError.hidden = true;
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showApp(session);
    } else {
      showLogin();
    }
  });

  function showLogin() {
    el.loginScreen.hidden = false;
    el.appScreen.hidden = true;
  }

  function showApp(session) {
    el.loginScreen.hidden = true;
    el.appScreen.hidden = false;
    el.staffName.textContent = session.user.email;
    initAppOnce();
    loadSchedule();
  }

  // ---------------------------------------------------------------
  // タブ・日付ナビゲーション(初回ログイン時に1度だけ配線)
  // ---------------------------------------------------------------

  let appInitialized = false;
  function initAppOnce() {
    if (appInitialized) return;
    appInitialized = true;

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.tab === btn.dataset.tab));
        if (btn.dataset.tab === 'content') loadContentTabOnce();
        if (btn.dataset.tab === 'shifts') initShiftsTabOnce();
        if (btn.dataset.tab === 'customers') initCustomersTabOnce();
      });
    });

    el.scheduleDate.value = formatDateLocal(new Date());
    el.scheduleDate.addEventListener('change', loadSchedule);
    el.prevDay.addEventListener('click', () => shiftDate(-1));
    el.nextDay.addEventListener('click', () => shiftDate(1));
    el.todayBtn.addEventListener('click', () => {
      el.scheduleDate.value = formatDateLocal(new Date());
      loadSchedule();
    });

    el.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      runSearch();
    });

    el.featureAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = el.featureAddForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await apiFetch('admin-site-content', '/features', {
          method: 'POST',
          body: {
            title: document.getElementById('featureAddTitle').value.trim(),
            description: document.getElementById('featureAddDescription').value.trim(),
            sort_order: Number(document.getElementById('featureAddSort').value) || 0,
          },
        });
        el.featureAddForm.reset();
        document.getElementById('featureAddSort').value = '0';
        await loadFeatures();
      } catch (err) {
        alert(`特徴カードの追加に失敗しました: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
      }
    });

    el.galleryAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = el.galleryAddForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await apiFetch('admin-site-content', '/gallery', {
          method: 'POST',
          body: {
            kind: document.getElementById('galleryAddKind').value,
            image_url: document.getElementById('galleryAddUrl').value.trim(),
            caption: document.getElementById('galleryAddCaption').value.trim(),
            sort_order: Number(document.getElementById('galleryAddSort').value) || 0,
          },
        });
        el.galleryAddForm.reset();
        document.getElementById('galleryAddSort').value = '0';
        await loadGallery();
      } catch (err) {
        alert(`写真の追加に失敗しました: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
      }
    });

    el.menuAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = el.menuAddForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await apiFetch('admin-menus', '', {
          method: 'POST',
          body: {
            name: document.getElementById('menuAddName').value.trim(),
            price: Number(document.getElementById('menuAddPrice').value),
            duration_minutes: Number(document.getElementById('menuAddDuration').value),
            description: document.getElementById('menuAddDescription').value.trim(),
            sort_order: Number(document.getElementById('menuAddSort').value) || 0,
          },
        });
        el.menuAddForm.reset();
        document.getElementById('menuAddSort').value = '0';
        await loadMenus();
      } catch (err) {
        alert(`メニューの追加に失敗しました: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
      }
    });

    setupContentSubnav();

    el.staffAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = el.staffAddForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await apiFetch('admin-site-content', '/staff', {
          method: 'POST',
          body: {
            name: document.getElementById('staffAddName').value.trim(),
            role: document.getElementById('staffAddRole').value,
          },
        });
        el.staffAddForm.reset();
        await loadStaffBios();
      } catch (err) {
        alert(`スタッフの追加に失敗しました: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
      }
    });

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
    el.crMenu.addEventListener('change', refreshCreateSlots);
    el.crStaff.addEventListener('change', refreshCreateSlots);
    el.crDate.addEventListener('change', refreshCreateSlots);

    el.editStatusForm.addEventListener('submit', submitStatusChange);
    el.editRescheduleForm.addEventListener('submit', submitReschedule);
    el.editStatusSelect.addEventListener('change', () => {
      el.editReasonField.hidden = !REASON_REQUIRED_STATUSES.has(el.editStatusSelect.value);
    });
    el.editStaffSelect.addEventListener('change', refreshEditSlots);
    el.editDateInput.addEventListener('change', refreshEditSlots);
  }

  // ---------------------------------------------------------------
  // モーダル共通
  // ---------------------------------------------------------------

  function openModal(modalEl) { modalEl.hidden = false; }
  function closeModal(modalEl) { modalEl.hidden = true; }

  // ---------------------------------------------------------------
  // 電話予約の代理登録
  // ---------------------------------------------------------------

  let menuOptionsCache = null;
  let staffOptionsCache = null;

  async function loadMenuOptions() {
    if (!menuOptionsCache) {
      const data = await apiFetch('menus', '');
      menuOptionsCache = data.menus;
    }
    return menuOptionsCache;
  }

  async function loadStaffOptions() {
    if (!staffOptionsCache) {
      const data = await apiFetch('staff', '');
      staffOptionsCache = data.staff;
    }
    return staffOptionsCache;
  }

  // メニュー・担当・日付から実際の空き枠を取得する(公開の GET /availability を利用)。
  // 開始時刻を自由入力にすると、30分刻みの実際の枠と一致しない時刻(例: 11:15)を
  // 送信したときに「その時刻の枠自体が存在しない」だけなのに「空きがない」と同じ
  // エラーになり紛らわしい不具合があったため、予約画面(reserve.js)と同様に
  // 必ず実際の枠一覧から選ばせる方式にしている。
  async function fetchAvailabilitySlots(menuId, staffId, date, excludeReservationId) {
    const params = new URLSearchParams({ date, menu_id: menuId });
    if (staffId) params.set('staff_id', staffId);
    if (excludeReservationId) params.set('exclude_reservation_id', excludeReservationId);
    return apiFetch('availability', `?${params.toString()}`);
  }

  // 指名なし時は同一時刻に複数スタッフの枠が並びうるので開始時刻だけで重複を除いて表示し、
  // 指名ありの時はそのスタッフの枠だけをそのまま表示する(いずれも値はstart_atのISO文字列)。
  function renderSlotOptions(selectEl, data) {
    if (!data || data.reason === 'closed') {
      selectEl.innerHTML = '<option value="">休業日です</option>';
      return;
    }
    if (!data.slots || data.slots.length === 0) {
      selectEl.innerHTML = '<option value="">空き枠がありません</option>';
      return;
    }
    const seen = new Set();
    const options = data.slots
      .filter((slot) => (seen.has(slot.start_at) ? false : (seen.add(slot.start_at), true)))
      .map((slot) => {
        const label = data.slots.some((s) => s.start_at === slot.start_at && s.staff_id !== slot.staff_id)
          ? `${jstTimeFmt.format(new Date(slot.start_at))}(${slot.staff_name})`
          : jstTimeFmt.format(new Date(slot.start_at));
        return `<option value="${slot.start_at}">${escapeHtml(label)}</option>`;
      });
    selectEl.innerHTML = '<option value="">選択してください</option>' + options.join('');
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
    const menuId = el.crMenu.value;
    const date = el.crDate.value;
    if (!menuId || !date) {
      el.crSlot.innerHTML = '<option value="">メニュー・日付を選択すると表示されます</option>';
      return;
    }
    const requestId = ++createSlotsRequestId;
    el.crSlot.innerHTML = '<option value="">読み込み中…</option>';
    try {
      const data = await fetchAvailabilitySlots(menuId, el.crStaff.value, date);
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
    el.crSlot.innerHTML = '<option value="">メニュー・日付を選択すると表示されます</option>';
    openModal(el.createReservationModal);

    try {
      const [menus, staff] = await Promise.all([loadMenuOptions(), loadStaffOptions()]);
      el.crMenu.innerHTML = '<option value="">選択してください</option>' + menus
        .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}(¥${yenFmt.format(m.price)})</option>`)
        .join('');
      el.crStaff.innerHTML = '<option value="">指名なし(おまかせ)</option>' +
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
          menu_id: el.crMenu.value,
          staff_id: el.crStaff.value || null,
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

  function openEditReservationModal(reservation) {
    editingReservation = reservation;
    const start = new Date(reservation.start_at);

    el.editReservationSummary.innerHTML = `
      <dt>予約番号</dt><dd>${escapeHtml(reservation.reservation_number)}</dd>
      <dt>お客様</dt><dd>${escapeHtml(reservation.customer?.name ?? '(顧客不明)')} ${escapeHtml(reservation.customer?.phone ?? '')}</dd>
      <dt>メニュー</dt><dd>${escapeHtml(reservation.menu_name ?? '')}</dd>
      <dt>現在の日時</dt><dd>${jstDateFmt.format(start)} ${jstTimeFmt.format(start)}</dd>
      <dt>現在のステータス</dt><dd>${(STATUS_META[reservation.status] || {}).label ?? reservation.status}</dd>
    `;

    hideFormError(el.editStatusError);
    hideFormError(el.editRescheduleError);
    el.editReasonField.hidden = true;
    el.editReasonInput.value = '';

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
    }

    el.editStaffSelect.innerHTML = '<option value="">指名なし(おまかせ)</option>' +
      (staffOptionsCache ?? []).map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    el.editStaffSelect.value = reservation.staff_id ?? '';
    el.editDateInput.value = formatDateLocal(start);

    openModal(el.editReservationModal);
    refreshEditSlots();

    // スタッフ選択肢が未取得(検索タブから直接開いた等)ならここで読み込んでから選択し直す
    if (!staffOptionsCache) {
      loadStaffOptions().then((staff) => {
        el.editStaffSelect.innerHTML = '<option value="">指名なし(おまかせ)</option>' +
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
      const data = await fetchAvailabilitySlots(editingReservation.menu_id, staffId, date, editingReservation.id);
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

    const submitBtn = el.editStatusForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await apiFetch('admin-reservations', `/${editingReservation.id}`, {
        method: 'PATCH',
        body: { status, cancel_reason: reason || undefined },
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

  async function submitReschedule(e) {
    e.preventDefault();
    hideFormError(el.editRescheduleError);
    if (!el.editDateInput.value || !el.editSlotSelect.value) {
      showFormError(el.editRescheduleError, '来店日・開始時刻を選択してください。');
      return;
    }

    const submitBtn = el.editRescheduleForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await apiFetch('admin-reservations', `/${editingReservation.id}`, {
        method: 'PATCH',
        body: { staff_id: el.editStaffSelect.value || null, start_at: el.editSlotSelect.value },
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
      await runSearch();
    } else {
      await loadSchedule();
    }
  }

  // 引数名を"el"にすると、ファイル冒頭のDOM参照まとめオブジェクト`el`をシャドーイングしてしまうため
  // 意図的に別名にしている(この2関数の中でだけ通じる罠を作らないため)。
  function showFormError(errorEl, message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
  function hideFormError(errorEl) {
    errorEl.hidden = true;
  }

  // ---------------------------------------------------------------
  // LPコンテンツ(CONCEPT / SHOP & STYLE / STAFF紹介文)
  // ---------------------------------------------------------------

  // 縦に長いLPコンテンツタブ内をすぐジャンプできるよう、見出しに追従してサブナビの現在地を光らせる。
  // 「サブナビの高さ分より上に来た見出しのうち、一番下にあるもの」を現在地とする定番のscrollspy方式
  // (IntersectionObserverの単純な出入り判定だと、末尾セクションがページ末尾に達した時に
  //  1つ前のセクションのハイライトが残ったままになる不具合が実機検証で見つかったため、この方式に変更した)。
  function setupContentSubnav() {
    const subnavLinks = [...document.querySelectorAll('.content-subnav a')];
    const headings = [...document.querySelectorAll('.content-heading[id]')];
    if (subnavLinks.length === 0 || headings.length === 0) return;

    const linkByHash = new Map(subnavLinks.map((a) => [a.getAttribute('href'), a]));
    const THRESHOLD_PX = 72; // サブナビ(sticky)のおおよその高さ

    function updateCurrent() {
      // ページ最下部までスクロール済みの場合、最後のセクションの残りコンテンツが
      // ビューポートより短いと、そのセクションの見出しが物理的に閾値ラインまで
      // 届かないことがある(実機検証で発見)。その場合は問答無用で最後を現在地とする。
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current = headings[0];
      if (atBottom) {
        current = headings[headings.length - 1];
      } else {
        for (const h of headings) {
          if (h.getBoundingClientRect().top - THRESHOLD_PX <= 0) current = h;
        }
      }
      subnavLinks.forEach((a) => a.classList.remove('is-current'));
      linkByHash.get(`#${current.id}`)?.classList.add('is-current');
    }

    window.addEventListener('scroll', updateCurrent, { passive: true });
    updateCurrent();
  }

  let contentTabLoaded = false;
  function loadContentTabOnce() {
    if (contentTabLoaded) return;
    contentTabLoaded = true;
    loadFeatures();
    loadGallery();
    loadMenus();
    loadStaffBios();
  }

  async function loadFeatures() {
    el.featureCards.innerHTML = '<p class="status-text">読み込み中…</p>';
    try {
      const data = await apiFetch('admin-site-content', '/features');
      renderFeatureCards(data.features);
    } catch (err) {
      el.featureCards.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderFeatureCards(features) {
    if (!features || features.length === 0) {
      el.featureCards.innerHTML = '<p class="status-text">特徴カードがまだ登録されていません。</p>';
      return;
    }
    el.featureCards.innerHTML = features.map((f) => `
      <div class="content-card" data-id="${f.id}">
        <div class="field"><label>タイトル</label><input type="text" class="f-title" value="${escapeHtml(f.title)}"></div>
        <div class="field"><label>説明文</label><input type="text" class="f-description" value="${escapeHtml(f.description)}"></div>
        <div class="field"><label>表示順</label><input type="text" inputmode="numeric" class="f-sort" value="${f.sort_order}"></div>
        <div class="field"><label><input type="checkbox" class="f-active" ${f.is_active ? 'checked' : ''}> LPに公開する</label></div>
        <div class="content-card-actions">
          <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
          <button type="button" class="btn btn-ghost btn-small delete-btn">削除</button>
          <span class="save-status"></span>
        </div>
      </div>
    `).join('');

    el.featureCards.querySelectorAll('.save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        const statusEl = card.querySelector('.save-status');
        btn.disabled = true;
        try {
          await apiFetch('admin-site-content', `/features/${card.dataset.id}`, {
            method: 'PATCH',
            body: {
              title: card.querySelector('.f-title').value.trim(),
              description: card.querySelector('.f-description').value.trim(),
              sort_order: Number(card.querySelector('.f-sort').value) || 0,
              is_active: card.querySelector('.f-active').checked,
            },
          });
          showSaveStatus(statusEl, '保存しました', true);
        } catch (err) {
          showSaveStatus(statusEl, `保存に失敗: ${err.message}`, false);
        } finally {
          btn.disabled = false;
        }
      });
    });

    el.featureCards.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        if (!confirm('この特徴カードを削除しますか?')) return;
        btn.disabled = true;
        try {
          await apiFetch('admin-site-content', `/features/${card.dataset.id}`, { method: 'DELETE' });
          await loadFeatures();
        } catch (err) {
          alert(`削除に失敗しました: ${err.message}`);
          btn.disabled = false;
        }
      });
    });
  }

  async function loadGallery() {
    el.galleryCards.innerHTML = '<p class="status-text">読み込み中…</p>';
    try {
      const data = await apiFetch('admin-site-content', '/gallery');
      renderGalleryCards(data.photos);
    } catch (err) {
      el.galleryCards.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderGalleryCards(photos) {
    if (!photos || photos.length === 0) {
      el.galleryCards.innerHTML = '<p class="status-text">写真がまだ登録されていません。</p>';
      return;
    }
    el.galleryCards.innerHTML = photos.map((p) => `
      <div class="content-card" data-id="${p.id}">
        <div class="field">
          <label>種類</label>
          <select class="f-kind">
            <option value="interior" ${p.kind === 'interior' ? 'selected' : ''}>店内メイン写真(interior)</option>
            <option value="style" ${p.kind === 'style' ? 'selected' : ''}>スタイル例(style)</option>
          </select>
        </div>
        <div class="field"><label>画像URL(パス)</label><input type="text" class="f-url" value="${escapeHtml(p.image_url)}"></div>
        <div class="field"><label>キャプション</label><input type="text" class="f-caption" value="${escapeHtml(p.caption ?? '')}"></div>
        <div class="field"><label>表示順</label><input type="text" inputmode="numeric" class="f-sort" value="${p.sort_order}"></div>
        <div class="field"><label><input type="checkbox" class="f-active" ${p.is_active ? 'checked' : ''}> LPに公開する</label></div>
        <div class="content-card-actions">
          <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
          <button type="button" class="btn btn-ghost btn-small delete-btn">削除</button>
          <span class="save-status"></span>
        </div>
      </div>
    `).join('');

    el.galleryCards.querySelectorAll('.save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        const statusEl = card.querySelector('.save-status');
        btn.disabled = true;
        try {
          await apiFetch('admin-site-content', `/gallery/${card.dataset.id}`, {
            method: 'PATCH',
            body: {
              kind: card.querySelector('.f-kind').value,
              image_url: card.querySelector('.f-url').value.trim(),
              caption: card.querySelector('.f-caption').value.trim(),
              sort_order: Number(card.querySelector('.f-sort').value) || 0,
              is_active: card.querySelector('.f-active').checked,
            },
          });
          showSaveStatus(statusEl, '保存しました', true);
        } catch (err) {
          showSaveStatus(statusEl, `保存に失敗: ${err.message}`, false);
        } finally {
          btn.disabled = false;
        }
      });
    });

    el.galleryCards.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        if (!confirm('この写真を削除しますか?')) return;
        btn.disabled = true;
        try {
          await apiFetch('admin-site-content', `/gallery/${card.dataset.id}`, { method: 'DELETE' });
          await loadGallery();
        } catch (err) {
          alert(`削除に失敗しました: ${err.message}`);
          btn.disabled = false;
        }
      });
    });
  }

  async function loadMenus() {
    el.menuCards.innerHTML = '<p class="status-text">読み込み中…</p>';
    try {
      const data = await apiFetch('admin-menus', '');
      renderMenuCards(data.menus);
    } catch (err) {
      el.menuCards.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  // メニューの削除は提供しない(reservations.menu_idが参照しているため物理削除は不可能。
  // staff/site_featuresと同じ考え方。掲載終了は「LPに公開する」チェックを外す運用にする)。
  function renderMenuCards(menus) {
    if (!menus || menus.length === 0) {
      el.menuCards.innerHTML = '<p class="status-text">メニューが登録されていません。</p>';
      return;
    }
    el.menuCards.innerHTML = menus.map((m) => `
      <div class="content-card" data-id="${m.id}">
        <div class="field"><label>メニュー名</label><input type="text" class="f-name" value="${escapeHtml(m.name)}"></div>
        <div class="field"><label>価格(円・税込)</label><input type="text" inputmode="numeric" class="f-price" value="${m.price}"></div>
        <div class="field"><label>所要時間(分)</label><input type="text" inputmode="numeric" class="f-duration" value="${m.duration_minutes}"></div>
        <div class="field"><label>説明文</label><input type="text" class="f-description" value="${escapeHtml(m.description ?? '')}"></div>
        <div class="field"><label>表示順</label><input type="text" inputmode="numeric" class="f-sort" value="${m.sort_order}"></div>
        <div class="field"><label><input type="checkbox" class="f-active" ${m.is_active ? 'checked' : ''}> LPに公開する</label></div>
        <div class="content-card-actions">
          <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
          <button type="button" class="btn btn-ghost btn-small delete-btn">削除</button>
          <span class="save-status"></span>
        </div>
      </div>
    `).join('');

    el.menuCards.querySelectorAll('.save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        const statusEl = card.querySelector('.save-status');
        btn.disabled = true;
        try {
          await apiFetch('admin-menus', `/${card.dataset.id}`, {
            method: 'PATCH',
            body: {
              name: card.querySelector('.f-name').value.trim(),
              price: Number(card.querySelector('.f-price').value),
              duration_minutes: Number(card.querySelector('.f-duration').value),
              description: card.querySelector('.f-description').value.trim(),
              sort_order: Number(card.querySelector('.f-sort').value) || 0,
              is_active: card.querySelector('.f-active').checked,
            },
          });
          showSaveStatus(statusEl, '保存しました', true);
        } catch (err) {
          showSaveStatus(statusEl, `保存に失敗: ${err.message}`, false);
        } finally {
          btn.disabled = false;
        }
      });
    });

    // 予約実績のあるメニューは削除できない(サーバー側の外部キー制約)。その場合はエラー
    // メッセージでそのまま案内する(実際に使われたことのないメニューだけが削除できる)。
    el.menuCards.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        if (!confirm('このメニューを削除しますか?')) return;
        btn.disabled = true;
        try {
          await apiFetch('admin-menus', `/${card.dataset.id}`, { method: 'DELETE' });
          await loadMenus();
        } catch (err) {
          alert(`削除に失敗しました: ${err.message}`);
          btn.disabled = false;
        }
      });
    });
  }

  async function loadStaffBios() {
    el.staffBioCards.innerHTML = '<p class="status-text">読み込み中…</p>';
    try {
      const data = await apiFetch('admin-site-content', '/staff');
      renderStaffBioCards(data.staff);
    } catch (err) {
      el.staffBioCards.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderStaffBioCards(staffList) {
    if (!staffList || staffList.length === 0) {
      el.staffBioCards.innerHTML = '<p class="status-text">スタッフが登録されていません。</p>';
      return;
    }
    el.staffBioCards.innerHTML = staffList.map((s) => `
      <div class="content-card" data-id="${s.id}">
        <div class="field"><label>氏名</label><input type="text" class="f-name" value="${escapeHtml(s.name)}"></div>
        <div class="field">
          <label>権限区分</label>
          <select class="f-role">
            <option value="stylist" ${s.role === 'stylist' ? 'selected' : ''}>スタイリスト(stylist)</option>
            <option value="assistant" ${s.role === 'assistant' ? 'selected' : ''}>アシスタント(assistant)</option>
            <option value="owner" ${s.role === 'owner' ? 'selected' : ''}>オーナー(owner)</option>
          </select>
        </div>
        <div class="field"><label>表示順</label><input type="text" inputmode="numeric" class="f-sort" value="${s.display_order}"></div>
        <div class="field"><label><input type="checkbox" class="f-active" ${s.is_active ? 'checked' : ''}> 稼働中(予約画面に表示する)</label></div>
        <div class="field"><label>英語表記名</label><input type="text" class="f-name-en" value="${escapeHtml(s.name_en ?? '')}"></div>
        <div class="field"><label>肩書き(LP表示用)</label><input type="text" class="f-role-label" value="${escapeHtml(s.bio_role_label ?? '')}" placeholder="例: スタイリスト / 理容歴4年"></div>
        <div class="field"><label>紹介コメント</label><input type="text" class="f-comment" value="${escapeHtml(s.bio_comment ?? '')}"></div>
        <div class="field"><label>アバター画像URL(パス)</label><input type="text" class="f-avatar" value="${escapeHtml(s.avatar_image_url ?? '')}" placeholder="未設定時はアイコン表示"></div>
        <div class="content-card-actions">
          <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
          <button type="button" class="btn btn-ghost btn-small delete-btn">削除</button>
          <span class="save-status"></span>
        </div>
      </div>
    `).join('');

    el.staffBioCards.querySelectorAll('.save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        const statusEl = card.querySelector('.save-status');
        btn.disabled = true;
        try {
          await apiFetch('admin-site-content', `/staff/${card.dataset.id}`, {
            method: 'PATCH',
            body: {
              name: card.querySelector('.f-name').value.trim(),
              role: card.querySelector('.f-role').value,
              display_order: Number(card.querySelector('.f-sort').value) || 0,
              is_active: card.querySelector('.f-active').checked,
              name_en: card.querySelector('.f-name-en').value.trim(),
              bio_role_label: card.querySelector('.f-role-label').value.trim(),
              bio_comment: card.querySelector('.f-comment').value.trim(),
              avatar_image_url: card.querySelector('.f-avatar').value.trim(),
            },
          });
          showSaveStatus(statusEl, '保存しました', true);
        } catch (err) {
          showSaveStatus(statusEl, `保存に失敗: ${err.message}`, false);
        } finally {
          btn.disabled = false;
        }
      });
    });

    // 予約実績のあるスタッフは削除できない(サーバー側の外部キー制約)。その場合はエラー
    // メッセージでそのまま案内する(実際に予約に使われたことのないスタッフだけが削除できる)。
    el.staffBioCards.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        if (!confirm('このスタッフを削除しますか?')) return;
        btn.disabled = true;
        try {
          await apiFetch('admin-site-content', `/staff/${card.dataset.id}`, { method: 'DELETE' });
          await loadStaffBios();
        } catch (err) {
          alert(`削除に失敗しました: ${err.message}`);
          btn.disabled = false;
        }
      });
    });
  }

  function showSaveStatus(statusEl, message, ok) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-ok', ok);
    statusEl.classList.toggle('is-error', !ok);
    setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('is-ok', 'is-error'); }, 3000);
  }

  function shiftDate(deltaDays) {
    const d = new Date(`${el.scheduleDate.value}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    el.scheduleDate.value = formatDateLocal(d);
    loadSchedule();
  }

  function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ---------------------------------------------------------------
  // スケジュール
  // ---------------------------------------------------------------

  async function loadSchedule() {
    const date = el.scheduleDate.value;
    if (!date) return;
    el.scheduleArea.innerHTML = '<p class="status-text">読み込み中…</p>';
    el.businessDayInfo.textContent = '';

    try {
      const data = await apiFetch('admin-reservations', `/schedule?date=${date}`);
      renderBusinessDayInfo(data.business_day);
      renderSchedule(data.staff);
    } catch (err) {
      el.scheduleArea.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderBusinessDayInfo(bd) {
    el.businessDayInfo.classList.remove('is-closed');
    if (!bd || !bd.is_open) {
      el.businessDayInfo.textContent = `休業日${bd?.note ? '(' + bd.note + ')' : ''}`;
      el.businessDayInfo.classList.add('is-closed');
      return;
    }
    const open = bd.open_time?.slice(0, 5);
    const close = bd.close_time?.slice(0, 5);
    const last = bd.last_reception_time?.slice(0, 5) ?? '-';
    el.businessDayInfo.textContent = `営業時間 ${open}〜${close}(最終受付 ${last})`;
  }

  function renderSchedule(staffList) {
    if (!staffList || staffList.length === 0) {
      el.scheduleArea.innerHTML = '<p class="status-text">スタッフが登録されていません。</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'staff-column-grid';

    staffList.forEach((staff) => {
      const col = document.createElement('div');
      col.className = 'staff-column';

      const shiftText = staff.shift && staff.shift.is_working
        ? `${staff.shift.start_time?.slice(0, 5)}〜${staff.shift.end_time?.slice(0, 5)}${staff.shift.break_start_time ? `(休憩 ${staff.shift.break_start_time.slice(0, 5)}〜${staff.shift.break_end_time.slice(0, 5)})` : ''}`
        : '本日休み';

      col.innerHTML = `
        <div class="staff-column-head">
          <h3>${escapeHtml(staff.name)}</h3>
          <span class="staff-shift-time">${shiftText}</span>
        </div>
        <div class="staff-column-body"></div>
      `;

      const body = col.querySelector('.staff-column-body');
      if (!staff.reservations || staff.reservations.length === 0) {
        body.innerHTML = '<div class="staff-column-empty">予約なし</div>';
      } else {
        staff.reservations.forEach((r) => body.appendChild(renderReservationCard({ ...r, staff_id: staff.id })));
      }

      grid.appendChild(col);
    });

    el.scheduleArea.innerHTML = '';
    el.scheduleArea.appendChild(grid);
  }

  function renderReservationCard(r) {
    const start = new Date(r.start_at);
    const end = new Date(r.end_at);
    const meta = STATUS_META[r.status] || { label: r.status, pill: 'is-muted' };

    const card = document.createElement('div');
    card.className = `reservation-card status-${r.status}`;
    card.dataset.id = r.id; // E2Eテスト等が特定の予約を一意に指せるように(同姓同名の顧客がいても曖昧にならない)
    card.innerHTML = `
      <div class="reservation-card-time">${jstTimeFmt.format(start)}〜${jstTimeFmt.format(end)}</div>
      <div class="reservation-card-customer">
        ${escapeHtml(r.customer?.name ?? '(顧客不明)')}
        ${r.customer?.is_blocked ? '<span class="no-show-flag">要注意</span>' : ''}
      </div>
      <div class="reservation-card-menu">${escapeHtml(r.menu_name ?? '')} ・ ¥${yenFmt.format(r.price)}</div>
      <div class="reservation-card-footer">
        <span class="status-pill ${meta.pill}">${meta.label}</span>
        <span class="source-tag">${SOURCE_LABEL[r.source] ?? r.source}</span>
      </div>
      <div class="reservation-card-actions">
        <button type="button" class="btn btn-ghost btn-small edit-reservation-btn">編集</button>
      </div>
    `;
    card.querySelector('.edit-reservation-btn').addEventListener('click', () => openEditReservationModal(r));
    return card;
  }

  // ---------------------------------------------------------------
  // 検索
  // ---------------------------------------------------------------

  async function runSearch() {
    const params = new URLSearchParams();
    const reservationNumber = document.getElementById('searchReservationNumber').value.trim();
    const phone = document.getElementById('searchPhone').value.trim();
    const name = document.getElementById('searchName').value.trim();
    const dateFrom = document.getElementById('searchDateFrom').value;
    const dateTo = document.getElementById('searchDateTo').value;
    const status = document.getElementById('searchStatus').value;

    if (reservationNumber) params.set('reservation_number', reservationNumber);
    if (phone) params.set('phone', phone);
    if (name) params.set('customer_name', name);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (status) params.set('status', status);
    params.set('limit', '100');

    el.searchArea.innerHTML = '<p class="status-text">検索中…</p>';
    el.searchResultMeta.textContent = '';

    try {
      const data = await apiFetch('admin-reservations', `?${params.toString()}`);
      renderSearchResults(data);
    } catch (err) {
      el.searchArea.innerHTML = `<p class="status-text">検索に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderSearchResults(data) {
    el.searchResultMeta.textContent = `${data.total}件中 ${data.reservations.length}件を表示`;

    if (data.reservations.length === 0) {
      el.searchArea.innerHTML = '<p class="status-text">該当する予約が見つかりませんでした。</p>';
      return;
    }

    const reservationById = new Map(data.reservations.map((r) => [r.id, r]));

    const rows = data.reservations.map((r) => {
      const start = new Date(r.start_at);
      const meta = STATUS_META[r.status] || { label: r.status, pill: 'is-muted' };
      return `
        <tr>
          <td>${escapeHtml(r.reservation_number)}</td>
          <td>${jstDateFmt.format(start)} ${jstTimeFmt.format(start)}</td>
          <td>${escapeHtml(r.customer?.name ?? '')}</td>
          <td>${escapeHtml(r.customer?.phone ?? '')}</td>
          <td>${escapeHtml(r.menu_name ?? '')}</td>
          <td>${escapeHtml(r.staff_name ?? '')}</td>
          <td><span class="status-pill ${meta.pill}">${meta.label}</span></td>
          <td>${SOURCE_LABEL[r.source] ?? r.source}</td>
          <td class="col-actions"><button type="button" class="btn btn-ghost btn-small edit-reservation-btn" data-id="${r.id}">編集</button></td>
        </tr>
      `;
    }).join('');

    el.searchArea.innerHTML = `
      <div class="search-table-wrap">
        <table class="search-table">
          <thead>
            <tr>
              <th>予約番号</th><th>日時</th><th>お客様</th><th>電話番号</th>
              <th>メニュー</th><th>担当</th><th>ステータス</th><th>経路</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    el.searchArea.querySelectorAll('.edit-reservation-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditReservationModal(reservationById.get(btn.dataset.id)));
    });
  }

  // ---------------------------------------------------------------
  // 営業日・シフト(月間カレンダー表示。日付をクリックしてモーダルで編集する)
  // ---------------------------------------------------------------

  let shiftsTabInitialized = false;
  function initShiftsTabOnce() {
    if (!el.shiftsMonth.value) el.shiftsMonth.value = monthValueOf(new Date());
    if (shiftsTabInitialized) return;
    shiftsTabInitialized = true;

    el.shiftsMonth.addEventListener('change', loadShiftsTab);
    el.shiftsPrevMonth.addEventListener('click', () => shiftMonth(-1));
    el.shiftsNextMonth.addEventListener('click', () => shiftMonth(1));
    el.generateBusinessDays.addEventListener('click', submitGenerateBusinessDays);
    el.generateStaffShifts.addEventListener('click', submitGenerateStaffShifts);
    el.shiftsStaffSelect.addEventListener('change', renderStaffShiftsCalendar);
    el.businessDayForm.addEventListener('submit', submitBusinessDayForm);
    el.staffShiftForm.addEventListener('submit', submitStaffShiftForm);

    loadShiftsTab();
  }

  function monthValueOf(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function shiftMonth(delta) {
    const [year, month] = el.shiftsMonth.value.split('-').map(Number);
    el.shiftsMonth.value = monthValueOf(new Date(year, month - 1 + delta, 1));
    loadShiftsTab();
  }

  // "2026-09" のような月の値から、その月の全日付("YYYY-MM-DD")を列挙する。
  function monthDateRange(monthValue) {
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

  function dateLabelJp(dateStr) {
    return jstDateFmt.format(new Date(`${dateStr}T00:00:00+09:00`));
  }

  const WEEKDAY_HEADERS_JA = ['日', '月', '火', '水', '木', '金', '土'];

  // 月の最初の曜日に合わせて空セルを先頭に置き、通常のカレンダーのように並べる。
  function renderCalendarGrid(containerEl, dates, cellRenderer) {
    const firstDow = new Date(`${dates[0]}T00:00:00+09:00`).getDay();
    const headers = WEEKDAY_HEADERS_JA.map((w) => `<div class="calendar-weekday">${w}</div>`).join('');
    const leading = Array.from({ length: firstDow }, () => '<div class="calendar-day-empty"></div>').join('');
    const cells = dates.map(cellRenderer).join('');
    containerEl.innerHTML = headers + leading + cells;
  }

  async function loadShiftsTab() {
    if (!el.shiftsMonth.value) return;
    await Promise.all([loadBusinessDays(), loadStaffShifts()]);
  }

  // ---- 営業日設定 ----

  let businessDaysByDate = new Map();

  async function loadBusinessDays() {
    const { dateFrom, dateTo, dates } = monthDateRange(el.shiftsMonth.value);
    el.businessDaysCalendar.innerHTML = '<p class="status-text">読み込み中…</p>';
    try {
      const data = await apiFetch('admin-business-days', `?date_from=${dateFrom}&date_to=${dateTo}`);
      businessDaysByDate = new Map((data.business_days ?? []).map((r) => [r.date, r]));
      renderBusinessDaysCalendar(dates);
    } catch (err) {
      el.businessDaysCalendar.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderBusinessDaysCalendar(dates) {
    renderCalendarGrid(el.businessDaysCalendar, dates, (date) => {
      const r = businessDaysByDate.get(date);
      const dayNum = Number(date.slice(-2));
      let cls;
      let info;
      if (!r) {
        cls = 'is-unset';
        info = '未設定';
      } else if (!r.is_open) {
        cls = 'is-closed';
        info = r.note || '休業';
      } else {
        cls = 'is-open';
        info = `${(r.open_time ?? '').slice(0, 5)}〜${(r.close_time ?? '').slice(0, 5)}`;
      }
      return `<button type="button" class="calendar-day ${cls}" data-date="${date}"><span class="calendar-day-num">${dayNum}</span><span class="calendar-day-info">${escapeHtml(info)}</span></button>`;
    });

    el.businessDaysCalendar.querySelectorAll('.calendar-day').forEach((btn) => {
      btn.addEventListener('click', () => openBusinessDayModal(btn.dataset.date));
    });
  }

  let editingBusinessDayDate = null;

  function openBusinessDayModal(date) {
    editingBusinessDayDate = date;
    el.businessDayModalTitle.textContent = `${dateLabelJp(date)}の営業日`;
    hideFormError(el.businessDayError);
    const r = businessDaysByDate.get(date) ?? { is_open: true, open_time: '10:00', close_time: '18:00', last_reception_time: '17:00', note: '' };
    el.bdOpen.checked = r.is_open;
    el.bdOpenTime.value = r.open_time ?? '';
    el.bdCloseTime.value = r.close_time ?? '';
    el.bdLastReception.value = r.last_reception_time ?? '';
    el.bdNote.value = r.note ?? '';
    openModal(el.businessDayModal);
  }

  async function submitBusinessDayForm(e) {
    e.preventDefault();
    hideFormError(el.businessDayError);
    const submitBtn = el.businessDayForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await apiFetch('admin-business-days', `/${editingBusinessDayDate}`, {
        method: 'PUT',
        body: {
          is_open: el.bdOpen.checked,
          open_time: el.bdOpenTime.value,
          close_time: el.bdCloseTime.value,
          last_reception_time: el.bdLastReception.value || null,
          note: el.bdNote.value.trim(),
        },
      });
      closeModal(el.businessDayModal);
      await loadBusinessDays();
    } catch (err) {
      showFormError(el.businessDayError, err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function submitGenerateBusinessDays() {
    const { year, month } = monthDateRange(el.shiftsMonth.value);
    el.generateBusinessDays.disabled = true;
    try {
      const result = await apiFetch('admin-business-days', '/generate-month', {
        method: 'POST',
        body: { year, month },
      });
      showSaveStatus(el.businessDaysGenerateStatus, `${result.generated}日分を生成しました`, true);
      await loadBusinessDays();
    } catch (err) {
      showSaveStatus(el.businessDaysGenerateStatus, `失敗: ${err.message}`, false);
    } finally {
      el.generateBusinessDays.disabled = false;
    }
  }

  // ---- スタッフシフト ----

  let staffShiftsByStaffDate = new Map();
  let currentShiftsDates = [];

  async function loadStaffShifts() {
    const { dateFrom, dateTo, dates } = monthDateRange(el.shiftsMonth.value);
    currentShiftsDates = dates;
    el.staffShiftsCalendar.innerHTML = '<p class="status-text">読み込み中…</p>';
    try {
      const [shiftsData, staffList] = await Promise.all([
        apiFetch('admin-staff-shifts', `?date_from=${dateFrom}&date_to=${dateTo}`),
        loadStaffOptions(),
      ]);
      staffShiftsByStaffDate = new Map((shiftsData.shifts ?? []).map((s) => [`${s.staff_id}_${s.date}`, s]));

      if (!staffList || staffList.length === 0) {
        el.shiftsStaffSelect.innerHTML = '';
        el.staffShiftsCalendar.innerHTML = '<p class="status-text">スタッフが登録されていません。</p>';
        return;
      }
      // 月をまたいで選択中のスタッフを維持する(一覧を再構築しても選択が飛ばないように)。
      const previousSelection = el.shiftsStaffSelect.value;
      el.shiftsStaffSelect.innerHTML = staffList.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      if (staffList.some((s) => s.id === previousSelection)) el.shiftsStaffSelect.value = previousSelection;

      renderStaffShiftsCalendar();
    } catch (err) {
      el.staffShiftsCalendar.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderStaffShiftsCalendar() {
    const staffId = el.shiftsStaffSelect.value;
    if (!staffId || currentShiftsDates.length === 0) return;

    renderCalendarGrid(el.staffShiftsCalendar, currentShiftsDates, (date) => {
      const s = staffShiftsByStaffDate.get(`${staffId}_${date}`);
      const dayNum = Number(date.slice(-2));
      let cls;
      let info;
      if (!s) {
        cls = 'is-unset';
        info = '未登録';
      } else if (!s.is_working) {
        cls = 'is-closed';
        info = s.note || '休み';
      } else {
        cls = 'is-open';
        info = `${(s.start_time ?? '').slice(0, 5)}〜${(s.end_time ?? '').slice(0, 5)}`;
        if (s.break_start_time) info += ` 休憩${(s.break_start_time ?? '').slice(0, 5)}〜${(s.break_end_time ?? '').slice(0, 5)}`;
      }
      return `<button type="button" class="calendar-day ${cls}" data-date="${date}"><span class="calendar-day-num">${dayNum}</span><span class="calendar-day-info">${escapeHtml(info)}</span></button>`;
    });

    el.staffShiftsCalendar.querySelectorAll('.calendar-day').forEach((btn) => {
      btn.addEventListener('click', () => openStaffShiftModal(staffId, btn.dataset.date));
    });
  }

  let editingShift = null; // { staffId, date }

  function openStaffShiftModal(staffId, date) {
    editingShift = { staffId, date };
    const staffName = (staffOptionsCache ?? []).find((s) => s.id === staffId)?.name ?? '';
    el.staffShiftModalTitle.textContent = `${dateLabelJp(date)}のシフト(${staffName})`;
    hideFormError(el.staffShiftError);
    const s = staffShiftsByStaffDate.get(`${staffId}_${date}`) ?? { is_working: true, start_time: '10:00', end_time: '18:00', break_start_time: '', break_end_time: '', note: '' };
    el.ssWorking.checked = s.is_working;
    el.ssStart.value = s.start_time ?? '';
    el.ssEnd.value = s.end_time ?? '';
    el.ssBreakStart.value = s.break_start_time ?? '';
    el.ssBreakEnd.value = s.break_end_time ?? '';
    el.ssNote.value = s.note ?? '';
    openModal(el.staffShiftModal);
  }

  async function submitStaffShiftForm(e) {
    e.preventDefault();
    hideFormError(el.staffShiftError);
    const submitBtn = el.staffShiftForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await apiFetch('admin-staff-shifts', `/${editingShift.staffId}/${editingShift.date}`, {
        method: 'PUT',
        body: {
          is_working: el.ssWorking.checked,
          start_time: el.ssStart.value,
          end_time: el.ssEnd.value,
          break_start_time: el.ssBreakStart.value,
          break_end_time: el.ssBreakEnd.value,
          note: el.ssNote.value.trim(),
        },
      });
      closeModal(el.staffShiftModal);
      await loadStaffShifts();
    } catch (err) {
      showFormError(el.staffShiftError, err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function submitGenerateStaffShifts() {
    const { year, month } = monthDateRange(el.shiftsMonth.value);
    el.generateStaffShifts.disabled = true;
    try {
      const result = await apiFetch('admin-staff-shifts', '/generate-month', {
        method: 'POST',
        body: { year, month },
      });
      if (result.note) {
        showSaveStatus(el.staffShiftsGenerateStatus, result.note, false);
      } else {
        showSaveStatus(el.staffShiftsGenerateStatus, `${result.generated}件のシフトを生成しました`, true);
      }
      await loadStaffShifts();
    } catch (err) {
      showSaveStatus(el.staffShiftsGenerateStatus, `失敗: ${err.message}`, false);
    } finally {
      el.generateStaffShifts.disabled = false;
    }
  }

  // ---------------------------------------------------------------
  // 顧客管理
  // ---------------------------------------------------------------

  let customersTabInitialized = false;
  function initCustomersTabOnce() {
    if (customersTabInitialized) return;
    customersTabInitialized = true;
    el.customerSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      runCustomerSearch();
    });
  }

  async function runCustomerSearch() {
    const phone = document.getElementById('customerSearchPhone').value.trim();
    const name = document.getElementById('customerSearchName').value.trim();
    if (!phone && !name) {
      el.customerCards.innerHTML = '<p class="status-text">電話番号または氏名を入力してください。</p>';
      el.customerResultMeta.textContent = '';
      return;
    }
    const params = new URLSearchParams();
    if (phone) params.set('phone', phone);
    if (name) params.set('name', name);
    params.set('limit', '50');

    el.customerCards.innerHTML = '<p class="status-text">検索中…</p>';
    el.customerResultMeta.textContent = '';
    try {
      const data = await apiFetch('admin-customers', `?${params.toString()}`);
      renderCustomerCards(data);
    } catch (err) {
      el.customerCards.innerHTML = `<p class="status-text">検索に失敗しました: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderCustomerCards(data) {
    el.customerResultMeta.textContent = `${data.total}件中 ${data.customers.length}件を表示`;
    if (data.customers.length === 0) {
      el.customerCards.innerHTML = '<p class="status-text">該当する顧客が見つかりませんでした。</p>';
      return;
    }

    el.customerCards.innerHTML = data.customers.map((c) => `
      <div class="content-card" data-id="${c.id}">
        <div class="field"><label>氏名</label><input type="text" class="f-name" value="${escapeHtml(c.name)}"></div>
        <div class="field"><label>フリガナ</label><input type="text" class="f-name-kana" value="${escapeHtml(c.name_kana ?? '')}"></div>
        <div class="field"><label>電話番号</label><input type="text" class="f-phone" value="${escapeHtml(c.phone)}"></div>
        <div class="field"><label>メールアドレス</label><input type="email" class="f-email" value="${escapeHtml(c.email ?? '')}"></div>
        <div class="field"><label>店舗メモ</label><input type="text" class="f-notes" value="${escapeHtml(c.notes ?? '')}" placeholder="アレルギー・要望など"></div>
        <div class="field"><label>無断キャンセル回数</label><input type="text" inputmode="numeric" class="f-no-show" value="${c.no_show_count}"></div>
        <div class="field"><label><input type="checkbox" class="f-blocked" ${c.is_blocked ? 'checked' : ''}> 要注意(ブロック)</label></div>
        <div class="content-card-actions">
          <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
          <button type="button" class="btn btn-ghost btn-small history-btn">予約履歴を見る</button>
          <span class="save-status"></span>
        </div>
        <div class="customer-history" hidden></div>
      </div>
    `).join('');

    // 電話番号は代理予約・編集モーダルと同じ自動ハイフン整形にする(reserve.js/admin.jsの他フォームと統一)。
    el.customerCards.querySelectorAll('.f-phone').forEach((input) => {
      input.addEventListener('input', () => {
        const wasAtEnd = input.selectionStart === input.value.length;
        input.value = formatPhoneNumber(input.value);
        if (wasAtEnd) {
          const len = input.value.length;
          input.setSelectionRange(len, len);
        }
      });
    });

    el.customerCards.querySelectorAll('.save-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.content-card');
        const statusEl = card.querySelector('.save-status');
        const noShowValue = Number(card.querySelector('.f-no-show').value);
        if (!Number.isInteger(noShowValue) || noShowValue < 0) {
          showSaveStatus(statusEl, '無断キャンセル回数は0以上の整数で入力してください', false);
          return;
        }
        btn.disabled = true;
        try {
          await apiFetch('admin-customers', `/${card.dataset.id}`, {
            method: 'PATCH',
            body: {
              name: card.querySelector('.f-name').value.trim(),
              name_kana: card.querySelector('.f-name-kana').value.trim(),
              phone: card.querySelector('.f-phone').value.trim(),
              email: card.querySelector('.f-email').value.trim(),
              notes: card.querySelector('.f-notes').value.trim(),
              no_show_count: noShowValue,
              is_blocked: card.querySelector('.f-blocked').checked,
            },
          });
          showSaveStatus(statusEl, '保存しました', true);
        } catch (err) {
          showSaveStatus(statusEl, `保存に失敗: ${err.message}`, false);
        } finally {
          btn.disabled = false;
        }
      });
    });

    el.customerCards.querySelectorAll('.history-btn').forEach((btn) => {
      btn.addEventListener('click', () => toggleCustomerHistory(btn));
    });
  }

  // 予約履歴は検索結果に含めていない(検索結果が多いとN+1になるため)。展開したときだけ
  // 個別に取得し、一度読み込んだら再度開閉してもキャッシュを使い回す。
  async function toggleCustomerHistory(btn) {
    const card = btn.closest('.content-card');
    const historyEl = card.querySelector('.customer-history');
    if (!historyEl.hidden) {
      historyEl.hidden = true;
      return;
    }
    if (historyEl.dataset.loaded === 'true') {
      historyEl.hidden = false;
      return;
    }
    btn.disabled = true;
    historyEl.hidden = false;
    historyEl.innerHTML = '<p class="status-text">読み込み中…</p>';
    try {
      const data = await apiFetch('admin-customers', `/${card.dataset.id}`);
      renderCustomerHistory(historyEl, data.reservations);
      historyEl.dataset.loaded = 'true';
    } catch (err) {
      historyEl.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderCustomerHistory(historyEl, reservations) {
    if (!reservations || reservations.length === 0) {
      historyEl.innerHTML = '<p class="status-text">予約履歴がありません。</p>';
      return;
    }
    const rows = reservations.map((r) => {
      const start = new Date(r.start_at);
      const meta = STATUS_META[r.status] || { label: r.status, pill: 'is-muted' };
      return `
        <tr>
          <td>${escapeHtml(r.reservation_number)}</td>
          <td>${jstDateFmt.format(start)} ${jstTimeFmt.format(start)}</td>
          <td><span class="status-pill ${meta.pill}">${meta.label}</span></td>
          <td>${SOURCE_LABEL[r.source] ?? r.source}</td>
          <td>¥${yenFmt.format(r.price)}</td>
        </tr>
      `;
    }).join('');
    historyEl.innerHTML = `
      <table>
        <thead><tr><th>予約番号</th><th>日時</th><th>ステータス</th><th>経路</th><th>料金</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ---------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
})();
