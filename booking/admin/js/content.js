// LPコンテンツタブ(評価バッジ・CONCEPT・SHOP & STYLE・MENU & PRICE・STAFF紹介文)。
// 2026-09-29、admin.js分割時に切り出した。

import {
  el, apiFetch, escapeHtml, showSaveStatus, previewInnerHtml, renderImagePreview, wireImageFileInput,
  deleteSiteImageIfOwned,
} from './core.js';

// 初回ログイン時に1度だけ配線する(追加フォームの送信配線)。データ読み込み自体は
// タブを初めて開いた時(loadContentTabOnce)まで遅延させる(元のadmin.jsと同じ挙動)。
export function wireContentTab() {
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

  wireImageFileInput(
    document.getElementById('galleryAddFile'),
    document.getElementById('galleryAddUrl'),
    'gallery',
    document.getElementById('galleryAddPreviewBox'),
  );

  el.galleryAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = el.galleryAddForm.querySelector('button[type="submit"]');
    const imageUrl = document.getElementById('galleryAddUrl').value.trim();
    if (!imageUrl) {
      alert('画像ファイルを選択してください。');
      return;
    }
    submitBtn.disabled = true;
    try {
      await apiFetch('admin-site-content', '/gallery', {
        method: 'POST',
        body: {
          kind: document.getElementById('galleryAddKind').value,
          image_url: imageUrl,
          caption: document.getElementById('galleryAddCaption').value.trim(),
          sort_order: Number(document.getElementById('galleryAddSort').value) || 0,
        },
      });
      el.galleryAddForm.reset();
      document.getElementById('galleryAddSort').value = '0';
      document.getElementById('galleryAddUrl').value = '';
      renderImagePreview(document.getElementById('galleryAddPreviewBox'), null);
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
          category: document.getElementById('menuAddCategory').value,
          price_is_from: document.getElementById('menuAddPriceFrom').checked,
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
}

// 縦に長いLPコンテンツタブ内をすぐジャンプできるよう、見出しに追従してサブナビの現在地を光らせる。
// 「サブナビの高さ分より上に来た見出しのうち、一番下にあるもの」を現在地とする定番のscrollspy方式
// (IntersectionObserverの単純な出入り判定だと、末尾セクションがページ末尾に達した時に
//  1つ前のセクションのハイライトが残ったままになる不具合が実機検証で見つかったため、この方式に変更した)。
function setupContentSubnav() {
  const subnavLinks = [...document.querySelectorAll('.content-subnav a')];
  const linkByHash = new Map(subnavLinks.map((a) => [a.getAttribute('href'), a]));
  // サブナビにリンクのある見出しだけを対象にする。営業日・シフトタブ(非表示)の見出しも
  // .content-headingを使っており、非表示要素は位置が常に0になるため、含めると常にそれが
  // 「現在地」に選ばれてしまい、サブナビのハイライトが一切付かなかった。
  const headings = [...document.querySelectorAll('.content-heading[id]')].filter((h) => linkByHash.has(`#${h.id}`));
  if (subnavLinks.length === 0 || headings.length === 0) return;
  const SUBNAV_PX = 72; // サブナビ(sticky)のおおよその高さ

  function updateCurrent() {
    // ページ最下部までスクロール済みの場合、最後のセクションの残りコンテンツが
    // ビューポートより短いと、そのセクションの見出しが物理的に閾値ラインまで
    // 届かないことがある(実機検証で発見)。その場合は問答無用で最後を現在地とする。
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    // 固定ヘッダー(.app-top)の下にサブナビが付くので、その分も含めた位置を基準にする。
    const appTopH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-top-h')) || 0;
    const thresholdPx = appTopH + SUBNAV_PX;
    let current = headings[0];
    if (atBottom) {
      current = headings[headings.length - 1];
    } else {
      for (const h of headings) {
        if (h.getBoundingClientRect().top - thresholdPx <= 0) current = h;
      }
    }
    subnavLinks.forEach((a) => a.classList.remove('is-current'));
    linkByHash.get(`#${current.id}`)?.classList.add('is-current');
  }

  window.addEventListener('scroll', updateCurrent, { passive: true });
  updateCurrent();
}

let contentTabLoaded = false;
export function loadContentTabOnce() {
  if (contentTabLoaded) return;
  contentTabLoaded = true;
  loadRating();
  loadFeatures();
  loadGallery();
  loadMenus();
  loadStaffBios();
}

async function loadRating() {
  try {
    const data = await apiFetch('admin-site-content', '/rating');
    el.ratingScoreInput.value = data.rating.rating;
    el.ratingCountInput.value = data.rating.review_count;
  } catch (err) {
    showSaveStatus(el.ratingSaveStatus, `取得に失敗: ${err.message}`, false);
  }
}

el.ratingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = el.ratingForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await apiFetch('admin-site-content', '/rating', {
      method: 'PUT',
      body: {
        rating: Number(el.ratingScoreInput.value),
        review_count: Number(el.ratingCountInput.value),
      },
    });
    showSaveStatus(el.ratingSaveStatus, '保存しました', true);
  } catch (err) {
    showSaveStatus(el.ratingSaveStatus, `保存に失敗: ${err.message}`, false);
  } finally {
    submitBtn.disabled = false;
  }
});

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
    <div class="content-card has-image" data-id="${p.id}" data-original-url="${escapeHtml(p.image_url)}">
      <div class="card-fields">
        <div class="field">
          <label>種類</label>
          <select class="f-kind">
            <option value="interior" ${p.kind === 'interior' ? 'selected' : ''}>店内メイン写真(interior)</option>
            <option value="style" ${p.kind === 'style' ? 'selected' : ''}>スタイル例(style)</option>
          </select>
        </div>
        <div class="field"><label>画像ファイル(差し替え)</label><input type="file" class="f-file" accept="image/jpeg,image/png,image/webp,image/gif"></div>
        <div class="field"><label>キャプション</label><input type="text" class="f-caption" value="${escapeHtml(p.caption ?? '')}"></div>
        <div class="field"><label>表示順</label><input type="text" inputmode="numeric" class="f-sort" value="${p.sort_order}"></div>
        <div class="field"><label><input type="checkbox" class="f-active" ${p.is_active ? 'checked' : ''}> LPに公開する</label></div>
        <input type="hidden" class="f-url" value="${escapeHtml(p.image_url)}">
      </div>
      <div class="image-preview-box">${previewInnerHtml(p.image_url)}</div>
      <div class="content-card-actions">
        <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
        <button type="button" class="btn btn-ghost btn-small delete-btn">削除</button>
        <span class="save-status"></span>
      </div>
    </div>
  `).join('');

  el.galleryCards.querySelectorAll('.content-card').forEach((card) => {
    wireImageFileInput(card.querySelector('.f-file'), card.querySelector('.f-url'), 'gallery', card.querySelector('.image-preview-box'));
  });

  el.galleryCards.querySelectorAll('.save-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.content-card');
      const statusEl = card.querySelector('.save-status');
      const previousUrl = card.dataset.originalUrl;
      const newUrl = card.querySelector('.f-url').value.trim();
      btn.disabled = true;
      try {
        await apiFetch('admin-site-content', `/gallery/${card.dataset.id}`, {
          method: 'PATCH',
          body: {
            kind: card.querySelector('.f-kind').value,
            image_url: newUrl,
            caption: card.querySelector('.f-caption').value.trim(),
            sort_order: Number(card.querySelector('.f-sort').value) || 0,
            is_active: card.querySelector('.f-active').checked,
          },
        });
        if (newUrl !== previousUrl) {
          deleteSiteImageIfOwned(previousUrl);
          card.dataset.originalUrl = newUrl;
        }
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
        deleteSiteImageIfOwned(card.dataset.originalUrl);
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
// staff/site_featuresと同じ考え方。掲載終了は「公開する」チェックを外す運用にする)。
// 「非公開のメニュー」欄の開閉状態(loadMenus()の再読み込みで欄ごと作り直されても維持する)。
let inactiveMenusOpen = false;

function menuCardHtml(m) {
  const categoryOption = (value, label) =>
    `<option value="${value}" ${m.category === value ? 'selected' : ''}>${label}</option>`;
  return `
    <div class="content-card menu-card" data-id="${m.id}" data-active="${m.is_active ? '1' : '0'}">
      <div class="field mc-name"><label>メニュー名</label><input type="text" class="f-name" value="${escapeHtml(m.name)}"></div>
      <div class="field mc-category">
        <label>区分</label>
        <select class="f-category">
          ${categoryOption('cut', 'カット(1予約で1つまで)')}
          ${categoryOption('color', 'カラー(1予約で1つまで)')}
          ${categoryOption('perm', 'パーマ(併用可)')}
          ${categoryOption('option', 'オプション(追加専用)')}
        </select>
      </div>
      <div class="field mc-price"><label>価格(円・税込)</label><input type="text" inputmode="numeric" class="f-price" value="${m.price}"></div>
      <div class="field mc-duration"><label>所要(分)</label><input type="text" inputmode="numeric" class="f-duration" value="${m.duration_minutes}"></div>
      <div class="field mc-sort"><label>表示順</label><input type="text" inputmode="numeric" class="f-sort" value="${m.sort_order}"></div>
      <div class="field mc-description"><label>説明文</label><input type="text" class="f-description" value="${escapeHtml(m.description ?? '')}"></div>
      <div class="field mc-from"><label><input type="checkbox" class="f-price-from" ${m.price_is_from ? 'checked' : ''}> 「〜」付き(下限価格)</label></div>
      <div class="field mc-active"><label><input type="checkbox" class="f-active" ${m.is_active ? 'checked' : ''}> 公開する</label></div>
      <div class="content-card-actions">
        <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
        <button type="button" class="btn btn-ghost btn-small delete-btn">削除</button>
        <span class="save-status"></span>
      </div>
    </div>
  `;
}

function renderMenuCards(menus) {
  if (!menus || menus.length === 0) {
    el.menuCards.innerHTML = '<p class="status-text">メニューが登録されていません。</p>';
    return;
  }
  // 公開中のメニューは通常表示、非公開のメニュー(旧セットメニュー等)は折りたたみ欄にまとめて一覧を短くする。
  // 再描画(保存で公開/非公開が変わった時など)しても、折りたたみの開閉状態は維持する。
  const wasInactiveOpen = inactiveMenusOpen;
  const activeMenus = menus.filter((m) => m.is_active);
  const inactiveMenus = menus.filter((m) => !m.is_active);
  el.menuCards.innerHTML = activeMenus.map(menuCardHtml).join('') + (inactiveMenus.length > 0 ? `
    <details class="menu-inactive-group"${wasInactiveOpen ? ' open' : ''}>
      <summary>非公開のメニュー(${inactiveMenus.length}件)<span class="menu-inactive-hint">LP・予約画面には表示されていません</span></summary>
      <div class="content-card-list">${inactiveMenus.map(menuCardHtml).join('')}</div>
    </details>
  ` : '');

  el.menuCards.querySelector('.menu-inactive-group')?.addEventListener('toggle', (ev) => {
    inactiveMenusOpen = ev.target.open;
  });

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
            category: card.querySelector('.f-category').value,
            price: Number(card.querySelector('.f-price').value),
            price_is_from: card.querySelector('.f-price-from').checked,
            duration_minutes: Number(card.querySelector('.f-duration').value),
            description: card.querySelector('.f-description').value.trim(),
            sort_order: Number(card.querySelector('.f-sort').value) || 0,
            is_active: card.querySelector('.f-active').checked,
          },
        });
        const nowActive = card.querySelector('.f-active').checked;
        if ((card.dataset.active === '1') !== nowActive) {
          // 公開/非公開が変わった: 「非公開のメニュー」欄との間で移動させるため再描画する。
          await loadMenus();
          return;
        }
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
    <div class="content-card" data-id="${s.id}" data-original-avatar="${escapeHtml(s.avatar_image_url ?? '')}">
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
      <div class="field">
        <label>アバター画像</label>
        <div class="avatar-file-row">
          <div class="avatar-preview-inline">${previewInnerHtml(s.avatar_image_url, '')}</div>
          <input type="file" class="f-avatar-file" accept="image/jpeg,image/png,image/webp,image/gif">
        </div>
      </div>
      <input type="hidden" class="f-avatar" value="${escapeHtml(s.avatar_image_url ?? '')}">
      <div class="content-card-actions">
        <button type="button" class="btn btn-primary btn-small save-btn">保存</button>
        <button type="button" class="btn btn-ghost btn-small delete-btn">削除</button>
        <span class="save-status"></span>
      </div>
    </div>
  `).join('');

  el.staffBioCards.querySelectorAll('.content-card').forEach((card) => {
    wireImageFileInput(card.querySelector('.f-avatar-file'), card.querySelector('.f-avatar'), 'staff-avatars', card.querySelector('.avatar-preview-inline'), '');
  });

  el.staffBioCards.querySelectorAll('.save-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.content-card');
      const statusEl = card.querySelector('.save-status');
      const previousAvatar = card.dataset.originalAvatar;
      const newAvatar = card.querySelector('.f-avatar').value.trim();
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
            avatar_image_url: newAvatar,
          },
        });
        if (newAvatar !== previousAvatar) {
          deleteSiteImageIfOwned(previousAvatar);
          card.dataset.originalAvatar = newAvatar;
        }
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
        deleteSiteImageIfOwned(card.dataset.originalAvatar);
        await loadStaffBios();
      } catch (err) {
        alert(`削除に失敗しました: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}
