// City Dogs 管理画面(admin/index.html)のE2Eテスト。
// テスト用のSupabase Authユーザーを一時作成 → staffに紐付け → ログイン →
// スケジュール/検索タブの表示確認 → LPコンテンツタブ(評価バッジ/CONCEPT/SHOP&STYLE/MENU&PRICE/STAFF)の
// 編集・追加・削除確認 → 電話予約の代理登録・ステータス変更・リスケジュール →
// 営業日・シフトタブ(一括生成→個別編集) → 顧客管理タブ(検索→編集→予約履歴確認) →
// 後片付け、までこれ1本で完結する。
//
// LPコンテンツタブは実データ(site_features/site_gallery_photos/menus/staff)を直接操作するため、
// テスト用の行だとひと目でわかる名称(TEST_*定数、末尾に(E2E))を使い、テスト終了後は必ず消す。
// menus/staffは「予約実績が一度でもあると削除不可」という仕様(外部キー制約)だが、テスト用に
// 作成した行は予約に使われていないので、features/galleryと同じくUI経由の削除で片付く。
// それでも、前回の実行が失敗して掃除できずに残った場合に備え、service_roleクライアントで
// 直接DELETEする掃除処理を実行前後の両方で通す(冪等・保険的なもの)。
//
// 電話予約の代理登録で作るテスト予約は、lp/tests/reserve.e2e.mjsと同じ方針で後片付けしない
// (テストデータは納品前にまとめてクリアする運用のため、1件ごとの後片付けは行わない)。
// 実行のたびに実行日+14日/+15日という相対日付を使うので、同日に複数回実行しない限り
// 既存のテストデータと衝突しない。
// 実行方法:
//   cd city-dogs/booking/admin
//   npm install                      (初回のみ)
//   npx playwright install chromium  (初回のみ)
//   SUPABASE_SERVICE_ROLE_KEY=<service_roleキー> npm run test:e2e
//
// service_role キーはダッシュボード(Project Settings > API)から取得する。
// 絶対にコードにハードコードしないこと(このファイルも含め)。
//
// ⚠️ Cloudflare Turnstile(2026-09-17、ログインフォームに導入)について: このテストは
// lp/tests/reserve.e2e.mjsと同じ理由で、config.jsのTURNSTILE_SITE_KEYをCloudflare公式の
// テスト専用キー(常に成功する)に一時差し替えてから実行する(下記のpage.route参照。
// 本番のconfig.jsファイル自体は書き換えない)。本番用のサイトキーだと実際にボット検知が
// 働き、Playwrightのヘッドレスブラウザは正当にボットとして弾かれてログインすらできない
// (2026-09-17に実機で確認済み)。
//
// 【2026-09-18訂正】ログインは`client.auth.signInWithPassword({ options: { captchaToken } })`
// でSupabase Auth自体(GoTrue)がトークンを検証する経路であり、`POST /reservations`が使う
// 私たち自身のEdge Function側`_shared/turnstile.ts`/`TURNSTILE_SECRET_KEY`は一切通らない
// (reserve.e2e.mjsとは検証経路が異なる、別物)。ログイン側のテスト専用キー切り替えは
// Supabaseダッシュボードの「Authentication > Attack Protection」設定で行うものであり、
// `npx supabase secrets set TURNSTILE_SECRET_KEY=...`はここには一切効果が無い
// (以前の版ではreserve.e2e.mjsと同じ手順が必要であるかのように書いていたが誤り)。

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

// spawn(..., { shell: true }) で得られるPIDはシェルのものであり、server.kill()や
// taskkill /t(プロセスツリー指定)でも、npx経由で起動した実際のserveプロセスまでは
// 終了できないことを確認済み(残り続け、次回実行時にポート衝突を起こす)。
// そのポートを実際にLISTENしているプロセスをnetstatで特定して直接killする方が確実。
function killByPort(port) {
  if (process.platform !== 'win32') return;
  const result = spawnSync(
    'cmd',
    ['/c', `netstat -ano | findstr :${port} | findstr LISTENING`],
    { encoding: 'utf8' },
  );
  const pids = new Set(
    (result.stdout || '')
      .split('\n')
      .map((line) => line.trim().split(/\s+/).pop())
      .filter((pid) => pid && /^\d+$/.test(pid)),
  );
  for (const pid of pids) {
    spawnSync('taskkill', ['/pid', pid, '/f']);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const shotDir = path.join(__dirname, 'screenshots');

const SUPABASE_URL = 'https://cwojmmrnhvemupxubtus.supabase.co';
const ANON_KEY = 'sb_publishable_nYEHBjojuRPhIpjBPKG4NQ_nNfQVn7E';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PORT = 5502;
const BASE_URL = `http://localhost:${PORT}`;
const TEST_STAFF_NAME = 'スタイリスト'; // ログインを紐付けるスタッフ(seed投入済みの前提。2026-09-16に実名から変更)
const TEST_EMAIL = 'temp-e2e-admin@citydogs.invalid';
const TEST_PASSWORD = 'TempTest12345!';

// LPコンテンツタブのテスト用マーカー。実データに混ざっても一目でテスト由来とわかる名称にする。
const TEST_FEATURE_TITLE = 'E2Eテスト特徴カード';
const TEST_GALLERY_CAPTION = 'E2Eテスト写真(E2E)';
const TEST_MENU_NAME = 'E2Eテストメニュー';
const TEST_STAFF_BIO_NAME = 'E2Eテストスタッフ';

// 電話予約の代理登録テスト用。顧客名で一目でテスト由来とわかるようにする。
// 電話番号はcustomers.phoneがunique制約のため、再実行してもupsertで同じ顧客が再利用される想定。
const TEST_CUSTOMER_NAME = 'E2Eテスト顧客';
const TEST_PHONE_RAW = '08000000001'; // ハイフンなしで入力し、自動整形されるかも合わせて確認する
const TEST_PHONE_FORMATTED = '080-0000-0001';

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysLocal(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 営業日・シフトタブのテストで使う月。実際の営業日データ(seed.sql・手動運用分)と
// 絶対に被らないよう、十分先(実行日の8か月後)の月を対象にする。
function monthValueOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
const TEST_SHIFTS_MONTH = monthValueOf(new Date(new Date().getFullYear(), new Date().getMonth() + 8, 1));

// 追加フォーム送信後、一覧の再描画(Edge Function呼び出し込み)が完了するまでの時間は
// コールドスタート時など読めない。固定のwaitForTimeoutだけに頼ると、再描画前に判定して
// しまい「追加した行が見つからない」という誤検知(実機で確認済み)につながるため、一覧の
// 末尾要素の該当フィールドが期待値になるまでポーリングして待つ。
async function waitForLastCardWithValue(listLocator, fieldSelector, expectedValue, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const card = listLocator.locator('.content-card').last();
    if ((await card.count()) > 0) {
      const value = await card.locator(fieldSelector).inputValue().catch(() => null);
      if (value === expectedValue) return card;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`一覧の末尾要素が期待値 "${expectedValue}" になりませんでした(${timeoutMs}ms待機)。`);
}

// 上と同じ理由(再描画のタイミングは読めない)で、特定要素のテキストが期待の文字列を
// 含むようになるまでポーリングして待つ汎用ヘルパー。
async function waitForLocatorText(locator, expectedSubstring, timeoutMs = 10000) {
  const start = Date.now();
  let lastText = '';
  while (Date.now() - start < timeoutMs) {
    lastText = await locator.innerText().catch(() => '');
    if (lastText.includes(expectedSubstring)) return lastText;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`要素のテキストが期待値 "${expectedSubstring}" を含みませんでした(${timeoutMs}ms待機)。実際: "${lastText}"`);
}

// カレンダーセルの保存(PUT)成功後、admin.js側は「モーダルを閉じる」→(await)「一覧を
// 再読み込みしてカレンダーを再描画する」の順で処理する。前者は同期的だが後者は非同期のため、
// モーダルが閉じた直後に固定時間だけ待って再クリックすると、再描画が終わる前の古いデータで
// モーダルが再度開いてしまうことがある(実機で発生: 保存した休憩時間が空欄のまま表示された)。
// 「セルをクリックして開く→期待する値になっているか確認→なっていなければ閉じてリトライ」を
// ポーリングすることで、再描画のタイミングを固定時間に頼らず待つ。
async function reopenUntil(page, cellLocator, modalLocator, checkFn, timeoutMs = 10000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    await cellLocator.click();
    await modalLocator.waitFor({ state: 'visible' });
    try {
      if (await checkFn()) return;
    } catch (e) {
      lastError = e;
    }
    const modalId = await modalLocator.getAttribute('id');
    await page.click(`[data-close-modal="${modalId}"]`);
    await modalLocator.waitFor({ state: 'hidden' });
    await new Promise((r) => setTimeout(r, 300));
  }
  throw lastError ?? new Error('カレンダー再描画待ちがタイムアウトしました。');
}

// 日付を1日ずつ進めながら、実際に空き枠がある日が見つかるまで試す。固定の相対日付
// (例: 実行日+15日)を決め打ちすると、休業日(定休日)に当たったり、このテストが
// 予約を後片付けしない方針(冒頭のコメント参照)であるために同日に何度も実行し直すと
// 枠が埋まってしまったりする(いずれも2026-09-16に実機で発生)。日付選択に依存する
// ステップでは、決め打ちよりもこちらを使うこと。
async function findDateWithRealOptions(page, dateInputSelector, optionsLocator, startOffsetDays, maxAttempts = 15) {
  let lastError = null;
  for (let i = 0; i < maxAttempts; i++) {
    const date = formatDateLocal(addDaysLocal(new Date(), startOffsetDays + i));
    await page.fill(dateInputSelector, date);
    try {
      const values = await waitForRealOptions(optionsLocator, 5000);
      return { date, values };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('空き枠のある日が見つかりませんでした。');
}

// メニュー・空き枠のセレクトは非同期(Edge Function呼び出し)で選択肢が埋まるため、
// プレースホルダー("読み込み中…"等、value="")以外の実際の選択肢が現れるまで待つ。
async function waitForRealOptions(locator, timeoutMs = 15000) {
  const start = Date.now();
  let lastLabels = [];
  while (Date.now() - start < timeoutMs) {
    const options = await locator.locator('option').evaluateAll((opts) => opts.map((o) => ({ value: o.value, text: o.textContent })));
    lastLabels = options.map((o) => o.text);
    const real = options.filter((o) => o.value !== '').map((o) => o.value);
    if (real.length > 0) return real;
    await new Promise((r) => setTimeout(r, 300));
  }
  // 原因を推測しなくて済むよう、タイムアウト時点で実際に表示されていた選択肢の文言
  // (「読み込み中…」のままなのか「空き枠がありません」等の確定した結果なのかで、
  // 詰まっている場所が非同期処理待ちなのか実際のAPI応答なのか切り分けられる)を含める。
  throw new Error(`選択肢が時間内に読み込まれませんでした(${timeoutMs}ms待機)。表示されていた選択肢: ${JSON.stringify(lastLabels)}`);
}

// 前回の実行が失敗して掃除できずに残った場合に備え、実行前後どちらでも呼べる掃除処理。
// menus/staffは管理画面に削除手段がない設計のため、ここではservice_roleで直接DELETEする
// (本番運用では起こらない、テストだけの片付け経路)。
async function cleanupTestContentRows(admin) {
  await admin.from('site_features').delete().eq('title', TEST_FEATURE_TITLE);
  await admin.from('site_gallery_photos').delete().eq('caption', TEST_GALLERY_CAPTION);
  await admin.from('menus').delete().eq('name', TEST_MENU_NAME);
  await admin.from('staff').delete().eq('name', TEST_STAFF_BIO_NAME);
}

if (!SERVICE_ROLE_KEY) {
  console.error('環境変数 SUPABASE_SERVICE_ROLE_KEY が未設定です。ダッシュボードから取得して指定してください。');
  process.exit(1);
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`サーバーが${timeoutMs}ms以内に起動しませんでした: ${url}`);
}

async function run() {
  await fs.mkdir(shotDir, { recursive: true });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let server;
  let browser;
  let page;
  const consoleErrors = [];
  // tryブロックの中でconst/letで宣言すると、途中で例外が起きてfinallyに抜けたときに
  // 参照できない(ブロックスコープが別)。失敗時こそブラウザ側のエラーや画面の状態を
  // 確認したいので、finallyからも見えるようtryの外で宣言しておく。
  // 2026-09-18: 元々はtryの開始位置がAuthユーザー作成・スタッフ紐付けより後ろにあり、
  // その区間で例外が起きるとfinally自体を通らず後片付けが一切行われない不具合があった
  // (実機で発覚: スタッフ名の不一致でここが例外を投げ、作成済みのテスト用Authユーザーが
  // 後片付けされずに残留。次回実行時に「すでに登録済み」で連鎖的に失敗した)。
  // これらの変数もtryの外で宣言し、セットアップ段階の失敗もfinallyで必ず後片付けできるようにする。
  let created;
  let staffRow;
  let previousAuthUserId;
  let originalRatingRow;

  try {
    console.log('0. 前回実行の残骸を掃除(念のため)...');
    await cleanupTestContentRows(admin);

    console.log('1. テスト用Authユーザーを作成し、スタッフに紐付け...');
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    created = createdUser;

    // 紐付け前の auth_user_id を必ず保存しておく。実際のオーナーアカウント等が
    // 既に紐付いている状態でこのテストを実行すると、後片付けで無条件にnullへ戻して
    // しまい、本物のログインを壊すという事故が過去に発生した。テスト前の状態への
    // 復元(null固定ではなく)を徹底することで再発を防ぐ。
    const { data: staffRowResult, error: staffFindErr } = await admin
      .from('staff')
      .select('id, name, auth_user_id')
      .eq('name', TEST_STAFF_NAME)
      .single();
    if (staffFindErr) throw staffFindErr;
    staffRow = staffRowResult;
    previousAuthUserId = staffRow.auth_user_id;

    await admin.from('staff').update({ auth_user_id: created.user.id }).eq('id', staffRow.id);

    // 評価バッジ(site_rating)はTEST_*プレフィックスで分離できる他のLPコンテンツと違い、
    // 常に1行だけしかない本番表示用の値そのものを書き換えることになる。auth_user_idの
    // 復元と同じ考え方で、テスト前の値を保存しておきfinallyで必ず元に戻す。
    const { data: originalRatingRowResult, error: originalRatingErr } = await admin
      .from('site_rating')
      .select('rating, review_count')
      .eq('id', 1)
      .single();
    if (originalRatingErr) throw originalRatingErr;
    originalRatingRow = originalRatingRowResult;

    server = spawn(`npx --yes serve -l ${PORT} .`, { cwd: adminRoot, shell: true, stdio: 'ignore' });

    await waitForServer(`${BASE_URL}/index.html`);

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    // 特徴カード/写真の削除は confirm() を使う。既定の自動キャンセルだと削除が進まないため、
    // このテストでは常に「OK」を選ぶ(このテストで開くダイアログは削除確認だけの想定)。
    page.on('dialog', (dialog) => dialog.accept());

    // 本番用のTurnstileサイトキー(config.js)は実際のボット検知を行うため、Playwrightの
    // ヘッドレスブラウザは正当にボットとして弾かれてしまい、トークンが永久に発行されない
    // (lp/tests/reserve.e2e.mjsと同じ理由・同じ対策。ファイル冒頭の⚠️コメント参照)。
    // Cloudflare公式のテスト専用サイトキー(常に成功する)に、このテスト実行時だけ
    // 差し替える。本番のconfig.jsファイル自体は書き換えない。
    const TEST_TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
    await page.route('**/js/config.js', async (route) => {
      const realConfig = await fs.readFile(path.join(adminRoot, 'js', 'config.js'), 'utf8');
      const testConfig = realConfig.replace(
        /TURNSTILE_SITE_KEY:\s*'[^']*'/,
        `TURNSTILE_SITE_KEY: '${TEST_TURNSTILE_SITE_KEY}'`,
      );
      await route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: testConfig });
    });

    console.log('2. ログイン...');
    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForSelector('#loginForm');
    await page.fill('#loginEmail', TEST_EMAIL);
    await page.fill('#loginPassword', TEST_PASSWORD);
    // Cloudflare Turnstileのトークン生成は非同期(テスト用サイトキーでは数秒で完了する)。
    // 生成前にクリックすると「ロボットでないことの確認が完了していません」で弾かれるため、
    // 固定waitではなくトークンが入るまで待つ(reserve.e2e.mjsと同じ理由)。
    await page.waitForFunction(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]');
      return input && input.value;
    }, { timeout: 15000 });
    await page.click('#loginSubmit');
    await page.waitForSelector('#appScreen:not([hidden])', { timeout: 10000 });

    console.log('3. スケジュールタブ...');
    await page.fill('#scheduleDate', new Date().toISOString().slice(0, 10));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(shotDir, 'schedule.png'), fullPage: true });

    console.log('4. 検索タブ...');
    await page.click('.tab-btn[data-tab="search"]');
    await page.click('#searchForm button[type="submit"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(shotDir, 'search.png'), fullPage: true });
    const metaText = await page.locator('#searchResultMeta').innerText();
    console.log('   検索結果:', metaText);

    console.log('5. LPコンテンツタブへ切り替え...');
    await page.click('.tab-btn[data-tab="content"]');
    await page.waitForSelector('#featureCards .content-card, #featureCards .status-text');

    console.log('5.5. 評価バッジ(★スコア・口コミ件数): 編集→保存→ページ再読み込みで反映確認...');
    await page.waitForFunction(() => document.getElementById('ratingScoreInput')?.value !== '', { timeout: 10000 });
    const TEST_RATING_SCORE = '3.33';
    const TEST_RATING_COUNT = '777';
    await page.fill('#ratingScoreInput', TEST_RATING_SCORE);
    await page.fill('#ratingCountInput', TEST_RATING_COUNT);
    await page.click('#ratingForm button[type="submit"]');
    await waitForLocatorText(page.locator('#ratingSaveStatus'), '保存しました');

    // フォームの表示が変わっただけでなく、実際にDBへ保存されたかをページ再読み込み後の
    // 再取得で確認する(楽観的なUI更新だけを見て「保存できた」と誤判定しないため)。
    await page.reload();
    await page.waitForSelector('#appScreen:not([hidden])', { timeout: 10000 });
    await page.click('.tab-btn[data-tab="content"]');
    await page.waitForSelector('#featureCards .content-card, #featureCards .status-text');
    await page.waitForFunction(() => document.getElementById('ratingScoreInput')?.value !== '', { timeout: 10000 });
    const reloadedScore = await page.inputValue('#ratingScoreInput');
    const reloadedCount = await page.inputValue('#ratingCountInput');
    if (Number(reloadedScore).toFixed(2) !== Number(TEST_RATING_SCORE).toFixed(2) || reloadedCount !== TEST_RATING_COUNT) {
      throw new Error(`評価バッジの保存内容が再読み込み後に反映されていません: score="${reloadedScore}", count="${reloadedCount}"`);
    }
    console.log('   評価バッジの編集・保存・再読み込み後の反映を確認(元の値はfinallyで復元)');

    console.log('6. CONCEPT(特徴カード): 追加→編集→削除...');
    // 新規登録欄は2026-09-18から<details>で折りたたみ式(デフォルト閉)になったため、
    // 中の入力欄を操作する前に必ず開く。
    await page.click('#featureAddSection summary');
    await page.fill('#featureAddTitle', TEST_FEATURE_TITLE);
    await page.fill('#featureAddDescription', 'E2Eテストで自動作成された特徴カードです。');
    await page.fill('#featureAddSort', '999'); // 末尾に来るようにして、追加した行を確実に特定できるようにする
    await page.click('#featureAddForm button[type="submit"]');
    // 注意: card.innerText()では<input value="...">の値は拾えない(inputの値はテキスト
    // ノードとして描画されないため)。inputValue()で実際の入力欄の値を読む必要がある。
    let card = await waitForLastCardWithValue(page.locator('#featureCards'), '.f-title', TEST_FEATURE_TITLE);
    // .last()は「常に一覧の最後の要素」を指す動的な参照なので、削除後にcard自体の
    // detachedを待っても、他のカードが残っていれば.last()はそちらに切り替わるだけで
    // 永久にdetachedと判定されない(実機で確認したタイムアウト不具合)。
    // 削除前にdata-id(このカード固有の識別子)を控えておき、そのIDを持つ要素が
    // 消えたかどうかで判定する。
    const featureCardId = await card.getAttribute('data-id');
    await card.locator('.f-description').fill('E2Eテストで更新した説明文です。');
    await card.locator('.save-btn').click();
    await waitForLocatorText(card.locator('.save-status'), '保存しました');
    await card.locator('.delete-btn').click();
    await page.locator(`#featureCards .content-card[data-id="${featureCardId}"]`).waitFor({ state: 'detached', timeout: 10000 });
    console.log('   特徴カードの追加・編集・削除を確認');

    console.log('7. SHOP & STYLE(写真): 追加→編集→削除...');
    await page.click('#galleryAddSection summary');
    await page.selectOption('#galleryAddKind', 'style'); // 'interior'は表示上1枚しか使われないため、既存の店内写真と衝突しないよう'style'を使う
    // #galleryAddUrlは2026-09-18の画像アップロード機能追加によりtype="hidden"になった
    // (通常はファイル選択→アップロード→自動反映される)。このテストはCRUD自体の確認が
    // 目的でアップロード機能自体は対象外のため、アップロード後を模してJSで直接値を入れる。
    await page.locator('#galleryAddUrl').evaluate((el) => { el.value = 'images/e2e-test-placeholder.jpg'; });
    await page.fill('#galleryAddCaption', TEST_GALLERY_CAPTION);
    await page.fill('#galleryAddSort', '999');
    await page.click('#galleryAddForm button[type="submit"]');
    card = await waitForLastCardWithValue(page.locator('#galleryCards'), '.f-caption', TEST_GALLERY_CAPTION);
    const galleryCardId = await card.getAttribute('data-id'); // 理由は特徴カードの箇所のコメント参照
    await card.locator('.f-caption').fill(`${TEST_GALLERY_CAPTION}(更新)`);
    await card.locator('.save-btn').click();
    await waitForLocatorText(card.locator('.save-status'), '保存しました');
    await card.locator('.delete-btn').click();
    await page.locator(`#galleryCards .content-card[data-id="${galleryCardId}"]`).waitFor({ state: 'detached', timeout: 10000 });
    console.log('   写真の追加・編集・削除を確認');

    console.log('8. MENU & PRICE(メニュー): 追加→編集→削除...');
    await page.click('#menuAddSection summary');
    await page.fill('#menuAddName', TEST_MENU_NAME);
    await page.fill('#menuAddPrice', '1234');
    await page.fill('#menuAddDuration', '30');
    await page.fill('#menuAddDescription', 'E2Eテストで自動作成されたメニューです。');
    await page.fill('#menuAddSort', '999');
    await page.click('#menuAddForm button[type="submit"]');
    card = await waitForLastCardWithValue(page.locator('#menuCards'), '.f-name', TEST_MENU_NAME);
    const menuCardId = await card.getAttribute('data-id'); // 理由は特徴カードの箇所のコメント参照
    await card.locator('.f-price').fill('1500');
    await card.locator('.save-btn').click();
    await waitForLocatorText(card.locator('.save-status'), '保存しました');
    // このテストメニューは一度も予約に使われていないので、削除できるはず
    // (予約実績があるメニューだけがサーバー側の外部キー制約で削除できない仕様)。
    await card.locator('.delete-btn').click();
    await page.locator(`#menuCards .content-card[data-id="${menuCardId}"]`).waitFor({ state: 'detached', timeout: 10000 });
    console.log('   メニューの追加・編集・削除を確認');

    console.log('9. STAFF(スタッフ管理・紹介文): 追加→編集→削除...');
    await page.click('#staffAddSection summary');
    await page.fill('#staffAddName', TEST_STAFF_BIO_NAME);
    await page.selectOption('#staffAddRole', 'assistant'); // 予約指名リストを汚さないようassistantで追加
    await page.click('#staffAddForm button[type="submit"]');
    card = await waitForLastCardWithValue(page.locator('#staffBioCards'), '.f-name', TEST_STAFF_BIO_NAME);
    const staffBioCardId = await card.getAttribute('data-id');
    await card.locator('.f-comment').fill('E2Eテストで追加したスタッフです。');
    await card.locator('.save-btn').click();
    await waitForLocatorText(card.locator('.save-status'), '保存しました');
    // このテストスタッフは一度も予約に使われていないので、削除できるはず
    // (予約実績があるスタッフだけがサーバー側の外部キー制約で削除できない仕様)。
    await card.locator('.delete-btn').click();
    await page.locator(`#staffBioCards .content-card[data-id="${staffBioCardId}"]`).waitFor({ state: 'detached', timeout: 10000 });
    console.log('   スタッフの追加・編集・削除を確認');

    console.log('10. スケジュールタブへ戻り、電話予約を代理登録...');
    await page.click('.tab-btn[data-tab="schedule"]');
    await page.click('#openCreateReservation');
    await page.locator('#createReservationModal').waitFor({ state: 'visible' });

    const menuValues = await waitForRealOptions(page.locator('#crMenu'));
    await page.selectOption('#crMenu', menuValues[0]);

    // 「指名なし」は2026-09-18に廃止し、担当スタイリストの選択が必須になった。
    // 選択しないと空き枠自体が取得されない(#crSlotが「担当スタイリストを選択すると
    // 表示されます」のままになる)。
    const createStaffValues = await waitForRealOptions(page.locator('#crStaff'));
    await page.selectOption('#crStaff', createStaffValues[0]);

    const createDate = formatDateLocal(addDaysLocal(new Date(), 14));
    await page.fill('#crDate', createDate);

    const createSlotValues = await waitForRealOptions(page.locator('#crSlot'));
    await page.selectOption('#crSlot', createSlotValues[0]);

    await page.fill('#crName', TEST_CUSTOMER_NAME);
    await page.fill('#crPhone', TEST_PHONE_RAW); // ハイフン無しで入力し、自動整形されることを下で確認する
    const formattedPhone = await page.inputValue('#crPhone');
    if (formattedPhone !== TEST_PHONE_FORMATTED) {
      throw new Error(`電話番号の自動ハイフン整形が期待通りではありません: "${formattedPhone}"(期待値: "${TEST_PHONE_FORMATTED}")`);
    }
    // メールアドレスは未入力のまま送信し、任意項目であることも合わせて確認する。

    // 過去に同じテスト顧客名で何度もこのテストを実行していると、同姓同名の予約が
    // 複数残ることがある(このテストは予約データを後片付けしない方針のため)。
    // 顧客名でカードを探す(.last()等)方式だと、どの予約を指しているか曖昧になり
    // 実際に誤検知を起こしたため、POSTレスポンス自体からこの予約固有のidを取得し、
    // 以降は必ずそのid(data-id属性)でカードを特定する。
    const [createResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/admin-reservations') && res.request().method() === 'POST'),
      page.click('#createReservationForm button[type="submit"]'),
    ]);
    const createdReservation = await createResponse.json();
    if (!createdReservation.id) {
      throw new Error(`予約作成のレスポンスにidが含まれていません: ${JSON.stringify(createdReservation)}`);
    }
    const reservationSelector = `#scheduleArea .reservation-card[data-id="${createdReservation.id}"]`;
    await page.locator('#createReservationModal').waitFor({ state: 'hidden', timeout: 15000 });

    let reservationCard = page.locator(reservationSelector);
    await reservationCard.waitFor({ timeout: 10000 });
    console.log('   電話予約の代理登録を確認(電話番号の自動ハイフン整形・実際の空き枠からの選択・メール任意入力すべて正常)');

    console.log('11. ステータス変更(確定 → 施術中)...');
    await reservationCard.locator('.edit-reservation-btn').click();
    await page.locator('#editReservationModal').waitFor({ state: 'visible' });
    const summaryText = await page.locator('#editReservationSummary').innerText();
    if (!summaryText.includes(TEST_CUSTOMER_NAME)) {
      throw new Error(`編集モーダルの概要にテスト顧客名が見つかりません: ${summaryText}`);
    }
    await page.selectOption('#editStatusSelect', 'in_service');
    await page.click('#editStatusForm button[type="submit"]');
    await page.locator('#editReservationModal').waitFor({ state: 'hidden', timeout: 10000 });

    reservationCard = page.locator(reservationSelector);
    await waitForLocatorText(reservationCard.locator('.status-pill'), '施術中');
    console.log('   ステータス変更(確定→施術中)を確認');

    console.log('12. リスケジュール(担当そのまま・別日の空き枠へ移動)...');
    await reservationCard.locator('.edit-reservation-btn').click();
    await page.locator('#editReservationModal').waitFor({ state: 'visible' });
    // このテストは予約を後片付けしない方針(冒頭のコメント参照)なので、リスケジュール先の
    // 日付は毎回そのまま残り続ける。固定の+15日を使っていたところ、同日に何度も実行し
    // 直した際に予約が積み上がって枠が埋まり、実際に「空き枠がありません」で失敗した
    // (2026-09-16に実機で発生)。+40日に変えても今度は休業日(定休日)に当たったため、
    // 決め打ちをやめて実際に空きがある日が見つかるまで1日ずつ探す方式にした。
    let rescheduleDate, editSlotValues;
    try {
      ({ date: rescheduleDate, values: editSlotValues } = await findDateWithRealOptions(
        page,
        '#editDateInput',
        page.locator('#editSlotSelect'),
        30,
      ));
    } catch (e) {
      // 原因を推測で決めつけないよう、失敗時に実際に表示されているプレースホルダーと
      // エラーメッセージ(取得失敗時にshowFormError()で#editRescheduleErrorへ表示される)を
      // そのままエラーに含める。
      const placeholderText = await page.locator('#editSlotSelect option').first().innerText().catch(() => '(取得失敗)');
      const errorBannerText = await page.locator('#editRescheduleError').innerText().catch(() => '(取得失敗)');
      throw new Error(`${e.message} プレースホルダー="${placeholderText}" エラー表示="${errorBannerText}"`);
    }
    await page.selectOption('#editSlotSelect', editSlotValues[0]);
    await page.click('#editRescheduleForm button[type="submit"]');
    await page.locator('#editReservationModal').waitFor({ state: 'hidden', timeout: 10000 });
    await page.waitForTimeout(800);

    await page.fill('#scheduleDate', rescheduleDate);
    const movedCard = page.locator(reservationSelector);
    await movedCard.waitFor({ timeout: 10000 });
    console.log('   リスケジュール(別日の空き枠への移動)を確認');

    console.log('13. 営業日・シフトタブ(カレンダー表示): 生成→編集を確認...');
    await page.click('.tab-btn[data-tab="shifts"]');
    await page.fill('#shiftsMonth', TEST_SHIFTS_MONTH); // 'change'イベントで自動的にその月を読み込む
    await page.waitForSelector('#businessDaysCalendar .calendar-day, #businessDaysCalendar .status-text');

    // 営業日を一括生成し、少なくとも1セル(実際に営業日として生成されたセル)が
    // 現れるまで待つ(生成後の再描画は非同期のため、固定時間待ちではなくセレクタ待ちにする)。
    await page.click('#generateBusinessDays');
    await waitForLocatorText(page.locator('#businessDaysGenerateStatus'), '日分を生成しました');
    await page.waitForSelector('#businessDaysCalendar .calendar-day.is-open', { timeout: 15000 });
    // 生成された日のうち最初の1件をクリックしてモーダルで編集→保存→再度開いて反映確認
    const businessDayDate = await page.locator('#businessDaysCalendar .calendar-day.is-open').first().getAttribute('data-date');
    const businessDayCell = page.locator(`#businessDaysCalendar .calendar-day[data-date="${businessDayDate}"]`);
    await businessDayCell.click();
    await page.locator('#businessDayModal').waitFor({ state: 'visible' });
    await page.fill('#bdNote', 'E2Eテストで編集した営業日メモです。');
    await page.click('#businessDayForm button[type="submit"]');
    await page.locator('#businessDayModal').waitFor({ state: 'hidden', timeout: 10000 });
    await reopenUntil(
      page,
      businessDayCell,
      page.locator('#businessDayModal'),
      async () => {
        const note = await page.inputValue('#bdNote');
        if (note !== 'E2Eテストで編集した営業日メモです。') throw new Error(`未反映(note="${note}")`);
        return true;
      },
    );
    const savedBdNote = await page.inputValue('#bdNote');
    if (savedBdNote !== 'E2Eテストで編集した営業日メモです。') {
      throw new Error(`営業日のメモが保存されていません: "${savedBdNote}"`);
    }
    await page.click('[data-close-modal="businessDayModal"]');
    await page.locator('#businessDayModal').waitFor({ state: 'hidden' });
    console.log(`   営業日の一括生成・個別編集(モーダル)を確認(対象日: ${businessDayDate})`);

    // スタッフシフトも同様に一括生成→編集を確認する(営業日を先に生成済みなので0件にはならないはず)
    await page.click('#generateStaffShifts');
    await waitForLocatorText(page.locator('#staffShiftsGenerateStatus'), '件のシフトを生成しました', 15000);
    await page.waitForSelector('#staffShiftsCalendar .calendar-day.is-open', { timeout: 15000 });
    const staffShiftDate = await page.locator('#staffShiftsCalendar .calendar-day.is-open').first().getAttribute('data-date');
    const staffShiftCell = page.locator(`#staffShiftsCalendar .calendar-day[data-date="${staffShiftDate}"]`);
    await staffShiftCell.click();
    await page.locator('#staffShiftModal').waitFor({ state: 'visible' });
    await page.fill('#ssNote', 'E2Eテストで編集したシフトメモです。');
    await page.fill('#ssBreakStart', '13:00');
    await page.fill('#ssBreakEnd', '14:00');
    await page.click('#staffShiftForm button[type="submit"]');
    await page.locator('#staffShiftModal').waitFor({ state: 'hidden', timeout: 10000 });
    await reopenUntil(
      page,
      staffShiftCell,
      page.locator('#staffShiftModal'),
      async () => {
        const note = await page.inputValue('#ssNote');
        const bs = await page.inputValue('#ssBreakStart');
        const be = await page.inputValue('#ssBreakEnd');
        // Postgresのtime型は"13:00:00"のように秒付きでJSON化され、<input type="time">の
        // .valueもその秒付き文字列をそのまま保持する(切り捨てられない)。admin.js側の表示も
        // 同じ理由で.slice(0, 5)している(renderStaffShiftsCalendar等)ため、比較もそれに合わせる。
        const ok = note === 'E2Eテストで編集したシフトメモです。' && bs.slice(0, 5) === '13:00' && be.slice(0, 5) === '14:00';
        if (!ok) {
          // reopenUntil()はこのエラーをlastErrorとして保持し、最終的にタイムアウトした
          // 場合にそのまま投げる。原因調査を推測に頼らないよう、実際に見えている値を残す。
          throw new Error(`未反映(note="${note}", break="${bs}"〜"${be}")`);
        }
        return true;
      },
    );
    const savedSsNote = await page.inputValue('#ssNote');
    if (savedSsNote !== 'E2Eテストで編集したシフトメモです。') {
      throw new Error(`シフトのメモが保存されていません: "${savedSsNote}"`);
    }
    const savedBreakStart = await page.inputValue('#ssBreakStart');
    const savedBreakEnd = await page.inputValue('#ssBreakEnd');
    if (savedBreakStart.slice(0, 5) !== '13:00' || savedBreakEnd.slice(0, 5) !== '14:00') {
      throw new Error(`シフトの休憩時間が保存されていません: "${savedBreakStart}"〜"${savedBreakEnd}"`);
    }
    await page.click('[data-close-modal="staffShiftModal"]');
    await page.locator('#staffShiftModal').waitFor({ state: 'hidden' });
    console.log('   スタッフシフトの一括生成・個別編集(休憩時間の保存込み、モーダル)を確認');

    // 休憩時間が実際に空き枠計算から除外されることを、公開APIのGET /availabilityで直接検証する
    // (管理画面UI経由の確認だけでは「保存できる」ことしか確認できないため)。
    const availStaffId = await page.inputValue('#shiftsStaffSelect');
    const { data: activeMenu, error: menuFetchErr } = await admin
      .from('menus')
      .select('id, duration_minutes')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (menuFetchErr || !activeMenu) {
      throw new Error(`休憩時間検証用のメニュー取得に失敗しました: ${menuFetchErr?.message}`);
    }
    const availUrl = `${SUPABASE_URL}/functions/v1/availability?date=${staffShiftDate}&menu_id=${activeMenu.id}&staff_id=${availStaffId}`;
    const availRes = await fetch(availUrl, { headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY } });
    const availData = await availRes.json();
    const breakStartMs = new Date(`${staffShiftDate}T13:00:00+09:00`).getTime();
    const breakEndMs = new Date(`${staffShiftDate}T14:00:00+09:00`).getTime();
    const durationMs = activeMenu.duration_minutes * 60000;
    const overlapsBreak = (availData.slots ?? []).some((s) => {
      if (s.staff_id !== availStaffId) return false;
      const slotStartMs = new Date(s.start_at).getTime();
      const slotEndMs = slotStartMs + durationMs;
      return slotStartMs < breakEndMs && breakStartMs < slotEndMs;
    });
    if (overlapsBreak) {
      throw new Error('休憩時間帯(13:00-14:00)に重なる空き枠がGET /availabilityから除外されていません。');
    }
    console.log('   休憩時間がGET /availabilityの空き枠計算から正しく除外されることを確認');

    console.log('14. 顧客管理タブ: 検索→編集→予約履歴確認...');
    await page.click('.tab-btn[data-tab="customers"]');
    await page.fill('#customerSearchPhone', TEST_PHONE_RAW);
    await page.click('#customerSearchForm button[type="submit"]');
    await page.waitForSelector('#customerCards .content-card, #customerCards .status-text');
    const customerCard = page.locator('#customerCards .content-card').first();
    await customerCard.waitFor({ timeout: 10000 });
    const customerNameValue = await customerCard.locator('.f-name').inputValue();
    if (customerNameValue !== TEST_CUSTOMER_NAME) {
      throw new Error(`電話番号検索の結果、顧客名がテスト用の値と一致しません: "${customerNameValue}"`);
    }
    await customerCard.locator('.f-notes').fill('E2Eテストで編集した顧客メモです。');
    await customerCard.locator('.f-blocked').check(); // 要注意フラグも合わせて確認
    await customerCard.locator('.save-btn').click();
    await waitForLocatorText(customerCard.locator('.save-status'), '保存しました');

    // 予約履歴(手順10で作った代理予約)が表示されることを確認する
    await customerCard.locator('.history-btn').click();
    const historyEl = customerCard.locator('.customer-history');
    await historyEl.locator('table').waitFor({ timeout: 10000 });
    const historyText = await historyEl.innerText();
    if (!historyText.includes(createdReservation.reservation_number)) {
      throw new Error(`顧客の予約履歴に代理登録した予約(${createdReservation.reservation_number})が見つかりません: ${historyText}`);
    }
    console.log('   顧客検索・編集(メモ・要注意フラグ)・予約履歴表示を確認');

    console.log('15. 売上予定・実績タブ: 表示確認...');
    // 「読み込み中…」も完了後の「スタッフが登録されていません」等のエラー表示も同じ
    // .status-textクラスを使っているため、.staff-columnとの二択待ち(waitForSelector)では
    // 「読み込み中…」自体にマッチして非同期処理の完了を待たずに次へ進んでしまう
    // (実機で発覚。他の箇所の同種のパターンも潜在的に同じ弱点を抱えている可能性がある)。
    // 「読み込み中…」という文言が消えるまでポーリングする方式にする。
    async function waitForRevenueLoaded() {
      await page.waitForFunction(
        () => !document.getElementById('revenueArea')?.textContent.includes('読み込み中'),
        { timeout: 15000 },
      );
    }

    await page.click('.tab-btn[data-tab="revenue"]');
    await waitForRevenueLoaded();
    const revenueColumnCount = await page.locator('#revenueArea .staff-column').count();
    if (revenueColumnCount === 0) {
      const areaText = await page.locator('#revenueArea').innerText().catch(() => '(取得失敗)');
      throw new Error(`売上予定・実績タブにスタッフの列が1つも表示されていません。実際の表示="${areaText}"`);
    }
    // 手順10で代理登録した予約(createDate)の月に切り替え、見込み件数が
    // その分だけ増えている(0件のままではない)ことを確認する。
    await page.fill('#revenueMonth', createDate.slice(0, 7));
    await waitForRevenueLoaded();
    const forecastCountText = await page.locator('#revenueTotal .revenue-block').first().locator('.revenue-count').innerText();
    if (!(parseInt(forecastCountText, 10) >= 1)) {
      throw new Error(`代理予約作成後の月次見込み件数が0件のままです(表示="${forecastCountText}")。`);
    }
    console.log('   売上予定・実績タブの表示、および代理予約が見込み件数に反映されることを確認');
  } finally {
    // 途中で例外が起きて finally に来た場合でも、ブラウザ側のコンソールエラー・
    // 未捕捉例外(pageerror)は原因調査に重要な手がかりになるため、成功/失敗を問わず
    // 必ず出力する(以前は成功時にしか出力されず、失敗の原因調査ができなかった)。
    if (consoleErrors.length > 0) {
      console.error('--- ブラウザ側のコンソールエラー ---');
      console.error(consoleErrors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('--- ブラウザ側のコンソールエラーなし ---');
    }

    // 例外で抜けた場合、ここに到達した時点の画面がまさに失敗した瞬間の状態になる
    // (tryの残りは実行されないため)。原因調査用にスクリーンショットを残しておく。
    if (page) {
      await page.screenshot({ path: path.join(shotDir, 'failure.png'), fullPage: true }).catch(() => {});
    }
    if (browser) await browser.close();
    if (server) server.kill();
    killByPort(PORT);

    console.log('16. 後片付け(LPコンテンツのテストデータ・評価バッジ・テストユーザーの紐付け解除・削除)...');
    // 電話予約の代理登録で作った予約(reservations)は片付けない(テストデータは
    // 納品前に一括クリアする運用のため、lp/tests/reserve.e2e.mjsと同じ方針)。
    // 特徴カード/写真はUI経由の削除テストで既に消えているはずだが、途中で失敗した場合の
    // 取りこぼしに備えて、menus/staffと合わせてここでも名前ベースで一括削除する(冪等)。
    await cleanupTestContentRows(admin);
    // 以下はすべて、対応するセットアップ処理が実際に完了していた場合のみ後片付けする
    // (2026-09-18: セットアップ途中の例外でもここまで来るようになったため、
    // どこまで進んでいたか分からない状態でも安全に後片付けできるようガードを追加)。
    if (originalRatingRow) {
      // 評価バッジ(site_rating)はテスト値のまま残すと本番LPの表示を汚してしまうため、
      // auth_user_idと同じ考え方でテスト実行前の値に戻す。
      await admin.from('site_rating').update({ rating: originalRatingRow.rating, review_count: originalRatingRow.review_count }).eq('id', 1);
    }
    if (staffRow) {
      // null固定ではなく、テスト実行前に読み取った値に戻す(実アカウントが
      // 紐付いていた場合はそれを保護するため)。
      await admin.from('staff').update({ auth_user_id: previousAuthUserId }).eq('id', staffRow.id);
    }
    if (created) {
      await admin.auth.admin.deleteUser(created.user.id);
    }
    console.log('   done (auth_user_idを実行前の状態', previousAuthUserId ? `(${previousAuthUserId})` : '(未設定)', 'に復元、評価バッジも実行前の値に復元)');
  }
}

run().catch((err) => {
  console.error('E2Eテスト失敗:', err);
  process.exitCode = 1;
});
