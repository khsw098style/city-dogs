(() => {
  'use strict';

  // Supabase Edge Functions(公開API)。publishable/anonキーはクライアントに埋め込む前提の鍵。
  const { SUPABASE_URL, ANON_KEY, TURNSTILE_SITE_KEY } = window.CITY_DOGS_CONFIG;
  const API_BASE = `${SUPABASE_URL}/functions/v1`;

  // Cloudflare Turnstile(ボット対策)。reserve.html側でrender=explicitを指定しており、
  // スクリプト読み込み完了時にこのコールバックが呼ばれてから明示的にウィジェットを描画する
  // (data-sitekeyをHTMLに直書きせず、config.jsの値を使うため)。
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

  // seedで投入している営業日データの範囲に合わせている(現状60日先まで)。
  // 将来、店舗側で営業日をその都度設定する運用になったら見直す。
  const MAX_DAYS_AHEAD = 60;

  const PHONE_RE = /^0[789]0-?\d{4}-?\d{4}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const jstDateFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' });
  const jstTimeFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
  const yenFmt = new Intl.NumberFormat('ja-JP');

  const state = {
    menus: [],
    selectedMenu: null,
    staffList: [],
    selectedStaffId: '', // 担当スタイリストの指名は必須(2026-09-18〜)。空は「まだ選択されていない」
    selectedDate: null, // 'YYYY-MM-DD'
    slots: [],
    selectedSlot: null, // { start_at, staff_id, staff_name }
  };

  const el = {
    menuList: document.getElementById('menuList'),
    toStep2: document.getElementById('toStep2'),
    staffSelect: document.getElementById('staffSelect'),
    dateInput: document.getElementById('dateInput'),
    slotArea: document.getElementById('slotArea'),
    toStep3: document.getElementById('toStep3'),
    summaryBox: document.getElementById('summaryBox'),
    reserveForm: document.getElementById('reserveForm'),
    nameInput: document.getElementById('nameInput'),
    phoneInput: document.getElementById('phoneInput'),
    emailInput: document.getElementById('emailInput'),
    notesInput: document.getElementById('notesInput'),
    formError: document.getElementById('formError'),
    submitBtn: document.getElementById('submitBtn'),
    resultArea: document.getElementById('resultArea'),
    progress: document.getElementById('wizardProgress'),
  };

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------

  async function apiFetch(path, options = {}) {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      });
    } catch {
      throw new ApiClientError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。');
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      // レスポンスがJSONでない場合(まれなサーバーエラー等)はbody=nullのまま続行
    }

    if (!res.ok) {
      const message = body?.error?.message || 'エラーが発生しました。時間をおいて再度お試しください。';
      throw new ApiClientError(message, body?.error?.code);
    }

    return body;
  }

  class ApiClientError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }

  // ---------------------------------------------------------------
  // Step navigation
  // ---------------------------------------------------------------

  function showStep(step) {
    document.querySelectorAll('.wizard-step').forEach((section) => {
      const isTarget = section.dataset.step === String(step);
      section.hidden = !isTarget;
      section.classList.toggle('is-active', isTarget);
    });

    if (step === 1 || step === 2 || step === 3) {
      el.progress.querySelectorAll('li').forEach((li) => {
        const liStep = Number(li.dataset.step);
        li.classList.toggle('is-current', liStep === step);
        li.classList.toggle('is-done', liStep < step);
      });
    } else {
      // 完了/エラー画面ではウィザードの手順表示は不要なので全ステップ「完了」にして目立たなくする
      el.progress.querySelectorAll('li').forEach((li) => {
        li.classList.remove('is-current');
        li.classList.add('is-done');
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => showStep(Number(btn.dataset.back)));
  });

  // ---------------------------------------------------------------
  // STEP 1: メニュー
  // ---------------------------------------------------------------

  async function loadMenus() {
    try {
      const data = await apiFetch('/menus');
      state.menus = data.menus || [];
      renderMenuList();
    } catch (err) {
      el.menuList.innerHTML = `<p class="wizard-status">メニューの取得に失敗しました。時間をおいて再度お試しください。<br><span style="color:var(--text-faint,var(--muted))">(${escapeHtml(err.message)})</span></p>`;
    }
  }

  // 担当スタイリストの指名は必須(2026-09-18〜、「指名なし」は廃止)。
  // 取得に失敗する/1人も出てこない場合は選択そのものができず予約を続行できないため、
  // その旨をプルダウンに表示してブロックする。
  async function loadStaffList() {
    try {
      const data = await apiFetch('/staff');
      state.staffList = data.staff || [];
      if (state.staffList.length === 0) {
        el.staffSelect.innerHTML = '<option value="" disabled selected>現在ご案内できるスタイリストがいません</option>';
        return;
      }
      renderStaffOptions();
    } catch (err) {
      console.error('スタッフ一覧の取得に失敗しました:', err.message);
      el.staffSelect.innerHTML = '<option value="" disabled selected>取得に失敗しました。再読み込みしてください</option>';
    }
  }

  function renderStaffOptions() {
    state.staffList.forEach((staff) => {
      const opt = document.createElement('option');
      opt.value = staff.id;
      opt.textContent = staff.name;
      el.staffSelect.appendChild(opt);
    });
  }

  function renderMenuList() {
    if (state.menus.length === 0) {
      el.menuList.innerHTML = '<p class="wizard-status">現在ご案内できるメニューがありません。お電話にてお問い合わせください。</p>';
      return;
    }

    el.menuList.innerHTML = '';
    state.menus.forEach((menu) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-card';
      btn.dataset.id = menu.id;
      btn.innerHTML = `
        <span class="option-card-main">
          <h3>${escapeHtml(menu.name)}</h3>
          ${menu.description ? `<p>${escapeHtml(menu.description)}</p>` : ''}
        </span>
        <span class="option-card-meta">
          <span class="option-card-price">¥${yenFmt.format(menu.price)}</span>
          <span class="option-card-duration">約${menu.duration_minutes}分</span>
        </span>
      `;
      btn.addEventListener('click', () => selectMenu(menu, btn));
      el.menuList.appendChild(btn);
    });
  }

  function selectMenu(menu, btnEl) {
    state.selectedMenu = menu;
    el.menuList.querySelectorAll('.option-card').forEach((c) => c.classList.remove('is-selected'));
    btnEl.classList.add('is-selected');
    el.toStep2.disabled = false;

    // メニューを変えたら、選び直しになるので日時選択をリセットする
    state.selectedDate = null;
    state.selectedSlot = null;
    el.toStep3.disabled = true;
  }

  el.toStep2.addEventListener('click', () => {
    showStep(2);
    if (el.dateInput.value) loadAvailability(el.dateInput.value);
  });

  // ---------------------------------------------------------------
  // STEP 2: 日時
  // ---------------------------------------------------------------

  function setupDateInput() {
    const today = new Date();
    const max = new Date(today.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
    el.dateInput.min = formatDateLocal(today);
    el.dateInput.max = formatDateLocal(max);
  }

  function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  el.dateInput.addEventListener('change', () => {
    state.selectedSlot = null;
    el.toStep3.disabled = true;
    if (el.dateInput.value) loadAvailability(el.dateInput.value);
  });

  el.staffSelect.addEventListener('change', () => {
    state.selectedStaffId = el.staffSelect.value;
    state.selectedSlot = null;
    el.toStep3.disabled = true;
    if (el.dateInput.value) loadAvailability(el.dateInput.value);
  });

  async function loadAvailability(date) {
    state.selectedDate = date;
    el.slotArea.innerHTML = '<p class="wizard-status">空き状況を確認しています…</p>';

    if (!state.selectedMenu) {
      el.slotArea.innerHTML = '<p class="wizard-status">先にメニューを選択してください。</p>';
      return;
    }
    if (!state.selectedStaffId) {
      el.slotArea.innerHTML = '<p class="wizard-status">先に担当スタイリストを選択してください。</p>';
      return;
    }

    try {
      const params = new URLSearchParams({ date, menu_id: state.selectedMenu.id, staff_id: state.selectedStaffId });
      const data = await apiFetch(`/availability?${params.toString()}`);
      state.slots = data.slots || [];
      renderSlots(data);
    } catch (err) {
      el.slotArea.innerHTML = `<p class="wizard-status">空き状況の取得に失敗しました。<br><span style="color:var(--text-faint,var(--muted))">(${escapeHtml(err.message)})</span></p>`;
    }
  }

  function renderSlots(data) {
    if (data.reason === 'closed') {
      el.slotArea.innerHTML = '<p class="wizard-status">選択された日は休業日です。別の日をお選びください。</p>';
      return;
    }
    if (!data.slots || data.slots.length === 0) {
      el.slotArea.innerHTML = '<p class="wizard-status">選択された日は空きがありません。別の日をお試しください。</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'slot-grid';

    data.slots.forEach((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = jstTimeFmt.format(new Date(slot.start_at));
      btn.addEventListener('click', () => selectSlot(slot, btn));
      grid.appendChild(btn);
    });

    el.slotArea.innerHTML = '';
    el.slotArea.appendChild(grid);
  }

  function selectSlot(slot, btnEl) {
    state.selectedSlot = slot;
    el.slotArea.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('is-selected'));
    btnEl.classList.add('is-selected');
    el.toStep3.disabled = false;
  }

  el.toStep3.addEventListener('click', () => {
    renderSummary();
    showStep(3);
  });

  // ---------------------------------------------------------------
  // STEP 3: お客様情報・確定
  // ---------------------------------------------------------------

  // 入力中の数字だけを抜き出して 090-1234-5678 の形にハイフンを自動挿入する。
  // 日本の携帯電話番号(11桁: 3-4-4)を前提にしている。
  function formatPhoneNumber(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  el.phoneInput.addEventListener('input', () => {
    const wasAtEnd = el.phoneInput.selectionStart === el.phoneInput.value.length;
    el.phoneInput.value = formatPhoneNumber(el.phoneInput.value);
    if (wasAtEnd) {
      const len = el.phoneInput.value.length;
      el.phoneInput.setSelectionRange(len, len);
    }
  });

  function renderSummary() {
    const { selectedMenu, selectedSlot } = state;
    if (!selectedMenu || !selectedSlot) return;

    const start = new Date(selectedSlot.start_at);
    const end = new Date(start.getTime() + selectedMenu.duration_minutes * 60 * 1000);

    el.summaryBox.innerHTML = `
      <dl>
        <dt>メニュー</dt><dd>${escapeHtml(selectedMenu.name)}</dd>
        <dt>日時</dt><dd>${jstDateFmt.format(start)} ${jstTimeFmt.format(start)}〜${jstTimeFmt.format(end)}</dd>
        <dt>担当</dt><dd>${escapeHtml(selectedSlot.staff_name)}</dd>
        <dt>料金</dt><dd class="summary-price">¥${yenFmt.format(selectedMenu.price)}</dd>
      </dl>
    `;
  }

  el.reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormError();

    const name = el.nameInput.value.trim();
    const phone = el.phoneInput.value.trim();
    const email = el.emailInput.value.trim();
    const notes = el.notesInput.value.trim();

    if (!name) return showFormError('お名前を入力してください。');
    if (!PHONE_RE.test(phone)) return showFormError('電話番号の形式が正しくありません(例: 090-1234-5678)。');
    if (!EMAIL_RE.test(email)) return showFormError('メールアドレスの形式が正しくありません。');
    if (!state.selectedMenu || !state.selectedSlot) return showFormError('メニューまたは日時が選択されていません。最初からやり直してください。');
    if (!turnstileToken) return showFormError('ロボットでないことの確認が完了していません。少し待ってから再度お試しください。');

    el.submitBtn.disabled = true;
    el.submitBtn.textContent = '送信しています…';

    try {
      const result = await apiFetch('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          customer: { name, phone, email },
          menu_id: state.selectedMenu.id,
          staff_id: state.selectedSlot.staff_id,
          start_at: state.selectedSlot.start_at,
          notes,
          turnstile_token: turnstileToken,
        }),
      });
      renderSuccess(result);
      showStep('result');
    } catch (err) {
      if (err.code === 'SLOT_UNAVAILABLE') {
        // 他のお客様に先に取られた可能性が高いので、空き状況を再取得して日時選択からやり直してもらう
        showFormError(`${err.message} お手数ですが、日時を選び直してください。`);
        state.selectedSlot = null;
        el.toStep3.disabled = true;
        if (state.selectedDate) loadAvailability(state.selectedDate);
        showStep(2);
      } else {
        showFormError(err.message);
      }
    } finally {
      el.submitBtn.disabled = false;
      el.submitBtn.textContent = '予約を確定する';
      // Turnstileのトークンは1回使うと無効になるため、次の送信に備えてリセットする
      // (成功時はこの後どうせ完了画面に遷移するので実害はない)。
      if (turnstileWidgetId !== null) {
        turnstile.reset(turnstileWidgetId);
        turnstileToken = null;
      }
    }
  });

  function showFormError(message) {
    el.formError.textContent = message;
    el.formError.hidden = false;
  }
  function hideFormError() {
    el.formError.hidden = true;
    el.formError.textContent = '';
  }

  // ---------------------------------------------------------------
  // RESULT
  // ---------------------------------------------------------------

  function renderSuccess(result) {
    const start = new Date(result.start_at);
    const end = new Date(result.end_at);

    el.resultArea.innerHTML = `
      <div class="result-card">
        <div class="result-icon is-success" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h2>ご予約ありがとうございます</h2>
        <p>ご入力いただいた内容で予約を承りました。</p>
        <p class="result-number">${escapeHtml(result.reservation_number)}</p>
        <div class="result-details">
          <dl>
            <dt>メニュー</dt><dd>${escapeHtml(state.selectedMenu.name)}</dd>
            <dt>日時</dt><dd>${jstDateFmt.format(start)} ${jstTimeFmt.format(start)}〜${jstTimeFmt.format(end)}</dd>
            <dt>担当</dt><dd>${escapeHtml(result.staff_name || '')}</dd>
            <dt>料金</dt><dd>¥${yenFmt.format(result.price)}</dd>
          </dl>
        </div>
        <p style="font-size:0.82rem;color:var(--muted)">ご入力いただいたメールアドレス宛に、予約の確認・変更・キャンセルができるリンクをお送りしました。予約番号とご登録の電話番号も、お問い合わせの際に必要です。控えておいてください。</p>
        <div class="result-actions">
          <a href="index.html" class="btn btn-primary">トップページに戻る</a>
          <a href="tel:08064810409" class="btn btn-outline">お店に電話する</a>
        </div>
      </div>
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

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------

  setupDateInput();
  loadMenus();
  loadStaffList();
})();
