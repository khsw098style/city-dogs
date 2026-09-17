// City Dogs 予約ウィザード(reserve.html)のE2Eテスト。
// 静的サーバーの起動〜Playwrightでの操作〜サーバー停止まで、これ1本で完結する。
//
// 実行方法:
//   cd city-dogs/lp
//   npm install        (初回のみ)
//   npx playwright install chromium   (初回のみ)
//   npm run test:e2e
//
// SUPABASE_SERVICE_ROLE_KEY=<service_roleキー> npm run test:e2e とすると、
// manage.html(予約確認・キャンセルページ)経由の照会・キャンセルまで通しで検証する
// (未設定でも予約作成までは検証される。service_roleキーは絶対にコードにハードコードしないこと)。
//
// このスクリプトは実際にデプロイ済みのSupabase Edge Functionsに対して
// 本物の予約を作成する(reserve.jsが本番APIのURLを直接叩いているため)。
// テストデータとして残ることを許容できる環境でのみ実行すること。
//
// ⚠️ Cloudflare Turnstile(2026-09-16導入)について: このテストはconfig.jsの
// TURNSTILE_SITE_KEYをCloudflare公式のテスト専用キー(常に成功する)に差し替えてから
// 実行する(下記のpage.route参照。本番のconfig.jsファイル自体は書き換えない)。
// これは本番用のTurnstileサイトキーだと実際にボット検知が働き、Playwrightの
// ヘッドレスブラウザが正当にボットとして弾かれてトークンが発行されないため
// (実機で確認済み)。ただし、これは片側(フロントエンド)だけの話で、
// **バックエンド側のTURNSTILE_SECRET_KEYが本番の実キーのままだと、テスト用の
// ダミートークンは「本番鍵はテスト用トークンを拒否する」というCloudflareの仕様により
// 拒否されてしまう**。そのため、このテストを実行する前に、一時的に
// `npx supabase secrets set TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"`
// (Cloudflare公式のテスト専用シークレットキー、常に成功する)に切り替え、
// テスト終了後は必ず本番の実キーに戻すこと。戻し忘れると、本番のTurnstile保護が
// 効かなくなる(誰のトークンでも通ってしまう)ので特に注意。

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

// spawn(..., { shell: true }) で得られるPIDはシェルのものであり、server.kill()や
// taskkill /t(プロセスツリー指定)でも、npx経由で起動した実際のserveプロセスまでは
// 終了できないことを確認済み(originとして残り続け、次回実行時にポート衝突を起こす)。
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
const lpRoot = path.resolve(__dirname, '..');
const shotDir = path.join(__dirname, 'screenshots');
const PORT = 5500;
const BASE_URL = `http://localhost:${PORT}`;

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // まだ起動していない。リトライ。
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`サーバーが${timeoutMs}ms以内に起動しませんでした: ${url}`);
}

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function run() {
  await fs.mkdir(shotDir, { recursive: true });

  // shell:trueと配列argsの組み合わせはNodeの非推奨警告対象(エスケープされない)。
  // 固定値のみを含む単一コマンド文字列にして警告を回避する。
  const server = spawn(`npx --yes serve -l ${PORT} .`, {
    cwd: lpRoot,
    shell: true,
    stdio: 'ignore',
  });

  let browser;
  try {
    await waitForServer(`${BASE_URL}/reserve.html`);

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

    // 本番用のTurnstileサイトキー(config.js)は実際のボット検知を行うため、Playwrightの
    // ヘッドレスブラウザは正当にボットとして弾かれてしまい、トークンが永久に発行されない
    // (実機で確認済み: 2026-09-16、本番キーへの切り替え直後にE2Eがタイムアウトした)。
    // Cloudflare公式のテスト専用サイトキー(常に成功する)に、このテスト実行時だけ
    // 差し替える。本番のconfig.jsファイル自体は書き換えない。
    const TEST_TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
    await page.route('**/js/config.js', async (route) => {
      const realConfig = await fs.readFile(path.join(lpRoot, 'js', 'config.js'), 'utf8');
      const testConfig = realConfig.replace(
        /TURNSTILE_SITE_KEY:\s*'[^']*'/,
        `TURNSTILE_SITE_KEY: '${TEST_TURNSTILE_SITE_KEY}'`,
      );
      await route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: testConfig });
    });

    await page.goto(`${BASE_URL}/reserve.html`);
    await page.waitForSelector('.option-card', { timeout: 10000 });
    await page.screenshot({ path: path.join(shotDir, '1-menu.png') });

    // STEP 1: メニュー選択(先頭のメニューを選ぶ)
    await page.click('.option-card:first-child');
    await page.click('#toStep2');
    await page.waitForSelector('#stepDatetime.is-active');

    // STEP 2: 担当スタイリストを明示的に指名する(「指名なし」以外の先頭オプションを選ぶ)。
    // これにより GET /availability?staff_id=... と POST /reservations の staff_id 連携を確認する。
    await page.waitForFunction(() => document.querySelectorAll('#staffSelect option').length > 1, { timeout: 10000 });
    await page.selectOption('#staffSelect', { index: 1 });
    const selectedStaffName = await page.locator('#staffSelect option:checked').innerText();
    console.log('指名したスタイリスト:', selectedStaffName);

    // 日時選択。休業日に当たる可能性があるので、空きが見つかるまで数日試す。
    let slotCount = 0;
    let triedDate = '';
    for (let offset = 1; offset <= 7 && slotCount === 0; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      triedDate = formatDateLocal(d);
      await page.fill('#dateInput', triedDate);
      await page.waitForTimeout(1200);
      slotCount = await page.locator('.slot-btn').count();
    }
    await page.screenshot({ path: path.join(shotDir, '2-slots.png') });

    if (slotCount === 0) {
      throw new Error('7日以内に空き枠が見つかりませんでした(seedデータの営業日設定を確認してください)。');
    }
    console.log(`空き枠 ${slotCount}件 (${triedDate})`);

    await page.click('.slot-btn:first-child');
    await page.click('#toStep3');
    await page.waitForSelector('#stepDetails.is-active');
    await page.screenshot({ path: path.join(shotDir, '3-details.png') });

    // STEP 3: お客様情報入力・送信
    await page.fill('#nameInput', 'E2Eテスト太郎');
    await page.fill('#phoneInput', '090-0000-0000');
    await page.fill('#emailInput', 'e2e-test@example.com');
    await page.fill('#notesInput', 'このデータはPlaywright E2Eテストによる自動生成です。');
    // Cloudflare Turnstileのトークン生成は非同期(テスト用サイトキーでは数秒で完了するが、
    // 実際のサイトキーだと時間がかかりうる)。生成前にクリックすると「ロボットでないことの
    // 確認が完了していません」で弾かれるため、固定waitではなくトークンが入るまで待つ。
    await page.waitForFunction(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]');
      return input && input.value;
    }, { timeout: 15000 });
    await page.click('#submitBtn');
    await page.waitForSelector('#stepResult.is-active', { timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotDir, '4-result.png') });

    const resultText = await page.locator('.result-card').innerText();
    console.log('--- 完了画面 ---');
    console.log(resultText);

    if (!resultText.includes(selectedStaffName)) {
      throw new Error(`指名したスタイリスト「${selectedStaffName}」が完了画面の担当者に反映されていません。`);
    }
    console.log('指名どおりのスタイリストで予約されたことを確認しました。');

    const reservationNumberMatch = resultText.match(/B\d{9}/);
    const reservationNumber = reservationNumberMatch ? reservationNumberMatch[0] : null;

    // SUPABASE_SERVICE_ROLE_KEY があれば、manage.html(予約確認・キャンセル専用ページ)も
    // 通しで確認する。manage_tokenは公開APIのレスポンスに含まれない(メール本文にのみ載る)ため、
    // service_role経由で直接取得する必要がある。
    if (reservationNumber && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('manage.html(予約確認・キャンセルページ)を確認...');
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(
        'https://cwojmmrnhvemupxubtus.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } },
      );
      const { data: row, error } = await admin
        .from('reservations')
        .select('manage_token')
        .eq('reservation_number', reservationNumber)
        .single();
      if (error || !row) throw new Error(`manage_tokenの取得に失敗: ${error?.message}`);

      await page.goto(`${BASE_URL}/manage.html?token=${row.manage_token}`);
      await page.waitForSelector('.manage-card', { timeout: 10000 });
      await page.screenshot({ path: path.join(shotDir, '5-manage.png') });

      const manageText = await page.locator('.manage-card').innerText();
      if (!manageText.includes(reservationNumber)) {
        throw new Error('manage.htmlに予約番号が表示されていません。');
      }

      await page.click('#cancelBtn');
      await page.waitForSelector('#cancelConfirm .cancel-confirm', { timeout: 5000 });
      await page.click('#cancelYes');
      await page.waitForSelector('.result-card', { timeout: 10000 });
      const cancelledText = await page.locator('.result-card').innerText();
      if (!cancelledText.includes('キャンセルが完了')) {
        throw new Error('manage.html経由のキャンセルが完了しませんでした。');
      }
      console.log('manage.html経由の照会・キャンセルを確認しました。');

      // 不正なトークンでアクセスした場合にエラー表示になることも確認する。
      // サーバーは意図どおり404を返すが、ブラウザはfetchの非2xxレスポンスを
      // 「リソース読み込み失敗」としてconsole.errorに出すため、この期待済みの
      // エラーはここで記録から除外する(以降に real な問題が起きていないかは
      // 引き続きチェックする)。
      const errorsBeforeInvalidTokenCheck = consoleErrors.length;
      await page.goto(`${BASE_URL}/manage.html?token=not-a-valid-token`);
      await page.waitForSelector('.result-icon.is-error', { timeout: 10000 });
      console.log('不正なトークンで正しくエラー表示されることを確認しました。');
      consoleErrors.length = errorsBeforeInvalidTokenCheck;
    } else {
      console.log('SUPABASE_SERVICE_ROLE_KEY が未設定のため、manage.htmlのテストはスキップしました。');
    }

    if (consoleErrors.length > 0) {
      console.error('--- コンソールエラーが発生しました ---');
      console.error(consoleErrors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('--- コンソールエラーなし ---');
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
    killByPort(PORT);
  }
}

run().catch((err) => {
  console.error('E2Eテスト失敗:', err);
  process.exitCode = 1;
});
