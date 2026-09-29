// 顧客管理タブ。2026-09-29、admin.js分割時に切り出した。

import { el, apiFetch, escapeHtml, showSaveStatus, formatPhoneNumber, jstDateFmt, jstTimeFmt, STATUS_META, SOURCE_LABEL, formatMenuPrice } from './core.js';

let customersTabInitialized = false;
export function initCustomersTabOnce() {
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
        <td>${formatMenuPrice(r.price, r.price_is_from)}</td>
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
