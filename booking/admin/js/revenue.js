// 売上予定・実績タブ(スタイリストごとの月次見込み・実績)。2026-09-29、admin.js分割時に切り出した。

import { el, apiFetch, escapeHtml, yenFmt, monthValueOf } from './core.js';

let revenueTabInitialized = false;
export function initRevenueTabOnce() {
  if (!el.revenueMonth.value) el.revenueMonth.value = monthValueOf(new Date());
  if (revenueTabInitialized) return;
  revenueTabInitialized = true;

  el.revenueMonth.addEventListener('change', loadRevenueTab);
  el.revenuePrevMonth.addEventListener('click', () => shiftRevenueMonth(-1));
  el.revenueNextMonth.addEventListener('click', () => shiftRevenueMonth(1));

  loadRevenueTab();
}

function shiftRevenueMonth(delta) {
  const [year, month] = el.revenueMonth.value.split('-').map(Number);
  el.revenueMonth.value = monthValueOf(new Date(year, month - 1 + delta, 1));
  loadRevenueTab();
}

async function loadRevenueTab() {
  const [year, month] = el.revenueMonth.value.split('-').map(Number);
  el.revenueTotal.innerHTML = '';
  el.revenueArea.innerHTML = '<p class="status-text">読み込み中…</p>';
  try {
    const data = await apiFetch('admin-reservations', `/revenue-summary?year=${year}&month=${month}`);
    renderRevenue(data.staff);
  } catch (err) {
    el.revenueArea.innerHTML = `<p class="status-text">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
  }
}

// hasEstimate: 会計金額が未確定の「〜」付き予約(下限価格で計上)を含む。金額が下限であることを明記する。
function revenueBlockHtml(label, count, amount, isActual, hasEstimate) {
  return `
    <div class="revenue-block${isActual ? ' is-actual' : ''}">
      <p class="revenue-label">${escapeHtml(label)}</p>
      <p class="revenue-amount">¥${yenFmt.format(amount)}${hasEstimate ? '〜' : ''}</p>
      <p class="revenue-count">${count}件</p>
      ${hasEstimate ? '<p class="revenue-note">※「〜」付き予約を含むため、下限額で集計しています</p>' : ''}
    </div>
  `;
}

function renderRevenue(staffList) {
  if (!staffList || staffList.length === 0) {
    el.revenueArea.innerHTML = '<p class="status-text">スタッフが登録されていません。</p>';
    return;
  }

  const total = staffList.reduce((acc, s) => ({
    forecast_count: acc.forecast_count + s.forecast_count,
    forecast_amount: acc.forecast_amount + s.forecast_amount,
    actual_count: acc.actual_count + s.actual_count,
    actual_amount: acc.actual_amount + s.actual_amount,
    forecast_has_estimate: acc.forecast_has_estimate || s.forecast_has_estimate,
    actual_has_estimate: acc.actual_has_estimate || s.actual_has_estimate,
  }), { forecast_count: 0, forecast_amount: 0, actual_count: 0, actual_amount: 0, forecast_has_estimate: false, actual_has_estimate: false });

  el.revenueTotal.innerHTML =
    revenueBlockHtml('全体の見込み', total.forecast_count, total.forecast_amount, false, total.forecast_has_estimate) +
    revenueBlockHtml('全体の実績', total.actual_count, total.actual_amount, true, total.actual_has_estimate);

  el.revenueArea.innerHTML = staffList.map((s) => `
    <div class="staff-column">
      <div class="staff-column-head"><h3>${escapeHtml(s.staff_name)}</h3></div>
      <div class="staff-column-body">
        ${revenueBlockHtml('見込み', s.forecast_count, s.forecast_amount, false, s.forecast_has_estimate)}
        ${revenueBlockHtml('実績', s.actual_count, s.actual_amount, true, s.actual_has_estimate)}
      </div>
    </div>
  `).join('');
}
