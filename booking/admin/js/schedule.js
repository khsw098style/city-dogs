// スケジュールタブ(日付×スタッフの予約一覧)。2026-09-29、admin.js分割時に切り出した。

import { el, apiFetch, escapeHtml, jstTimeFmt, STATUS_META, SOURCE_LABEL, reservationPriceLabel, formatDateLocal } from './core.js';
import { openEditReservationModal } from './reservationModal.js';

// 初回ログイン時に1度だけ配線する(スケジュールは初期表示タブのため、他のタブのように
// クリック時の遅延初期化ではなく、ログイン直後に即配線する)。
export function wireScheduleTab() {
  el.scheduleDate.value = formatDateLocal(new Date());
  el.scheduleDate.addEventListener('change', loadSchedule);
  el.prevDay.addEventListener('click', () => shiftDate(-1));
  el.nextDay.addEventListener('click', () => shiftDate(1));
  el.todayBtn.addEventListener('click', () => {
    el.scheduleDate.value = formatDateLocal(new Date());
    loadSchedule();
  });
}

function shiftDate(deltaDays) {
  const d = new Date(`${el.scheduleDate.value}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  el.scheduleDate.value = formatDateLocal(d);
  loadSchedule();
}

export async function loadSchedule() {
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
    <div class="reservation-card-menu">${escapeHtml(r.menu_name ?? '')} ・ ${reservationPriceLabel(r)}</div>
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
