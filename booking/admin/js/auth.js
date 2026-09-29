// ログイン・ログアウト・パスワード変更・Turnstile・セッション監視。
// 2026-09-29、admin.jsを機能ごとのファイルへ分割した際に切り出した。

import { client, el, openModal, closeModal } from './core.js';
import { initAppOnce } from './tabs.js';
import { loadSchedule } from './schedule.js';

const { TURNSTILE_SITE_KEY } = window.CITY_DOGS_CONFIG;

// Cloudflare Turnstile(ログイン総当たり対策)。lp/js/reserve.jsと同じ仕組み。
// index.html側でrender=explicitを指定しており、スクリプト読み込み完了時にこの
// コールバックが呼ばれてから明示的にウィジェットを描画する。
// ⚠️ window.onTurnstileLoadは、これを呼び出すCloudflareのTurnstileスクリプト
// (index.html)より前に定義されている必要がある。このモジュールがadmin.js経由で
// 一番最初にimportされ、かつTurnstileの<script>タグをadmin.jsの<script type="module">
// より後ろに置いているのはそのため(index.html側のコメント参照)。
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
