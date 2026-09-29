// 予約検索タブ。2026-09-29、admin.js分割時に切り出した。

import { el, apiFetch, escapeHtml, jstDateFmt, jstTimeFmt, STATUS_META, SOURCE_LABEL, formatDateLocal, SEARCH_PAGE_SIZE } from './core.js';
import { openEditReservationModal } from './reservationModal.js';

// 直近に「検索」を押した時点の条件(ページ送り・編集後の再読み込みはこの条件で行う。
// 入力欄を書き換えただけで検索を押していない状態でページを送っても、条件がずれないようにするため)。
let searchQuery = null; // { params: URLSearchParams(ページング以外), ascending: boolean }
let searchOffset = 0;

// 予約検索タブを最初に開いた時だけ、来店日(from)を本日にして「本日以降」を自動で検索する
// (条件なしだと過去分を含む全件になり、件数が増えるほど重くなるため)。
let searchTabInitialized = false;
export function initSearchTabOnce() {
  if (searchTabInitialized) return;
  searchTabInitialized = true;
  el.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch();
  });
  document.getElementById('searchDateFrom').value = formatDateLocal(new Date());
  runSearch();
}

// keepPosition=false(既定): フォームの現在の条件で最初のページから検索し直す。
// keepPosition=true: 直近の条件・ページ位置のまま再読み込みする(予約を編集した後など)。
export async function runSearch({ keepPosition = false } = {}) {
  if (!keepPosition || !searchQuery) {
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
    // 来店日(from)を指定した検索は時系列(早い順)、それ以外は新しい順で見るのが自然なため。
    searchQuery = { params, ascending: Boolean(dateFrom) };
    searchOffset = 0;
  }
  await fetchSearchPage();
}

async function fetchSearchPage() {
  const params = new URLSearchParams(searchQuery.params);
  params.set('sort', searchQuery.ascending ? 'asc' : 'desc');
  params.set('limit', String(SEARCH_PAGE_SIZE));
  params.set('offset', String(searchOffset));

  el.searchArea.innerHTML = '<p class="status-text">検索中…</p>';
  el.searchResultMeta.textContent = '';
  el.searchPager.innerHTML = '';

  try {
    const data = await apiFetch('admin-reservations', `?${params.toString()}`);
    // 編集でステータスが変わり絞り込み条件から外れた等で、最後のページが空になった場合は
    // 存在する最後のページへ戻す(空のページを表示し続けないため)。
    if (data.reservations.length === 0 && data.total > 0 && searchOffset > 0) {
      searchOffset = Math.floor((data.total - 1) / data.limit) * data.limit;
      await fetchSearchPage();
      return;
    }
    renderSearchResults(data);
  } catch (err) {
    el.searchArea.innerHTML = `<p class="status-text">検索に失敗しました: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSearchPager(data) {
  // 1ページの件数はサーバーが実際に採用した値(data.limit)を使う(上限による切り詰めがあっても表示がずれない)。
  const totalPages = Math.ceil(data.total / data.limit);
  if (totalPages <= 1) {
    el.searchPager.innerHTML = '';
    return;
  }
  const currentPage = Math.floor(data.offset / data.limit) + 1;
  el.searchPager.innerHTML = `
    <button type="button" class="btn btn-ghost btn-small" data-page-move="-1" ${currentPage <= 1 ? 'disabled' : ''}>‹ 前へ</button>
    <span class="search-pager-status">${currentPage} / ${totalPages} ページ</span>
    <button type="button" class="btn btn-ghost btn-small" data-page-move="1" ${currentPage >= totalPages ? 'disabled' : ''}>次へ ›</button>
  `;
  el.searchPager.querySelectorAll('[data-page-move]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      searchOffset = Math.max(0, searchOffset + Number(btn.dataset.pageMove) * data.limit);
      await fetchSearchPage();
      el.searchResultMeta.scrollIntoView({ block: 'start' });
    });
  });
}

function renderSearchResults(data) {
  const orderLabel = searchQuery?.ascending ? '来店日時の早い順' : '来店日時の新しい順';
  el.searchResultMeta.textContent = data.total === 0
    ? '0件'
    : `${data.total}件中 ${data.offset + 1}〜${data.offset + data.reservations.length}件目を表示(${orderLabel})`;

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
  renderSearchPager(data);
}
