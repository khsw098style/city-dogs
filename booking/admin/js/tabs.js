// タブ切り替え・初回ログイン時の配線オーケストレーター。2026-09-29、admin.js分割時に切り出した。
// 各タブの中身(スケジュール/検索/LPコンテンツ/シフト/顧客管理/売上)は個別のファイルに分かれており、
// このファイルが「どのタブを開いたら何を呼ぶか」だけをまとめる。

import { wireScheduleTab } from './schedule.js';
import { wireReservationModals } from './reservationModal.js';
import { initSearchTabOnce } from './search.js';
import { wireContentTab, loadContentTabOnce, refreshContentSubnavOnShow } from './content.js';
import { initShiftsTabOnce } from './shifts.js';
import { initCustomersTabOnce } from './customers.js';
import { initRevenueTabOnce } from './revenue.js';

export function activateTab(tabKey) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tabKey));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.tab === tabKey));
  if (tabKey === 'search') initSearchTabOnce();
  if (tabKey === 'content') {
    loadContentTabOnce();
    // パネルがdisplay:noneの間に初期計算すると、見出しが全部top:0に見えて
    // 最後の見出し(STAFF)が誤って選ばれてしまう(content.js参照)。表示に切り替わった
    // 直後にここで再計算し、正しい先頭(評価バッジ)を現在地にする。
    refreshContentSubnavOnShow();
  }
  if (tabKey === 'shifts') initShiftsTabOnce();
  if (tabKey === 'customers') initCustomersTabOnce();
  if (tabKey === 'revenue') initRevenueTabOnce();
}

// config.jsのENABLED_TABS(🏪店舗固有)でOFFにされたタブのボタンを隠す。
// タブの中身(.tab-panel)は元々.is-activeでないと表示されないCSSなので、
// activateTab()で選ばれない限り自然に非表示のままになる(パネル側は触らなくてよい)。
function applyEnabledTabs() {
  const enabledTabs = window.CITY_DOGS_CONFIG.ENABLED_TABS || {};
  const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
  tabBtns.forEach((btn) => {
    btn.hidden = enabledTabs[btn.dataset.tab] === false;
  });
  const activeBtn = tabBtns.find((b) => b.classList.contains('is-active'));
  if (!activeBtn || activeBtn.hidden) {
    const firstVisible = tabBtns.find((b) => !b.hidden);
    if (firstVisible) activateTab(firstVisible.dataset.tab);
  }
}

// ヘッダー+タブ(.app-top)は常に上に固定される。その下に付く追従ナビ(スケジュールの日付ナビ・
// LPコンテンツのサブナビ)がヘッダーの裏に潜らないよう、実際の高さをCSS変数に反映する
// (フォント・ウィンドウ幅・折り返しで高さが変わるため、固定値ではなく実測する)。
function setupStickyHeaderOffset() {
  const top = document.querySelector('.app-top');
  if (!top) return;
  const sync = () => {
    const isSticky = getComputedStyle(top).position === 'sticky'; // 狭い画面では固定しない
    document.documentElement.style.setProperty('--app-top-h', isSticky ? `${top.offsetHeight}px` : '0px');
  };
  new ResizeObserver(sync).observe(top);
  window.addEventListener('resize', sync);
  sync();
}

let appInitialized = false;
export function initAppOnce() {
  if (appInitialized) return;
  appInitialized = true;

  setupStickyHeaderOffset();

  applyEnabledTabs();
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  wireScheduleTab();
  wireReservationModals();
  wireContentTab();
}
