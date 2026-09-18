// LPトップページ(index.html)がsite-content.jsを通じて実際のSupabase Edge Functions
// (GET /site-content, GET /menus)からCONCEPT/SHOP&STYLE/MENU&PRICE/STAFFを
// 正しく描画できているかを検証するE2Eテスト。サーバー起動〜終了まで自己完結する。
//
// 実行方法:
//   cd city-dogs/lp
//   npm install                      (初回のみ)
//   npx playwright install chromium  (初回のみ)
//   node tests/site-content.e2e.mjs

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// reserve.e2e.mjsと同じ理由(Windowsでのプロセス終了漏れ対策)。詳細はそちらのコメント参照。
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
const PORT = 5501; // reserve.e2e.mjs(5500)と衝突しないポート
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

async function run() {
  const server = spawn(`npx --yes serve -l ${PORT} .`, {
    cwd: lpRoot,
    shell: true,
    stdio: 'ignore',
  });

  let browser;
  const failures = [];
  try {
    await waitForServer(`${BASE_URL}/index.html`);

    browser = await chromium.launch();
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE_URL}/index.html`);

    // site-content.jsのfetchが終わるまで待つ(「読み込んでいます…」が消えるまで)
    await page.waitForFunction(
      () => !document.querySelector('#featureGrid')?.textContent.includes('読み込んでいます'),
      { timeout: 15000 },
    );

    const featureCount = await page.locator('#featureGrid .feature-card').count();
    if (featureCount !== 3) failures.push(`CONCEPT: 期待した特徴カード数(3)と異なる: ${featureCount}`);

    // 写真は管理画面からのアップロード機能(2026-09-18追加)で差し替えられるため、
    // 「特定のファイル名を含むはず」という決め打ちの検証はもう成立しない
    // (実際にテスト中の画像アップロードで本番の店内写真データが差し替わり、
    // 決め打ちだったこの検証が壊れるという実害が出た)。評価バッジの検証と同じ考え方で、
    // 同じブラウザコンテキストから /site-content を直接叩いた結果と突き合わせる。
    const apiGallery = await page.evaluate(async () => {
      const { SUPABASE_URL, ANON_KEY } = window.CITY_DOGS_CONFIG;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/site-content`, {
        headers: { Authorization: `Bearer ${ANON_KEY}` },
      });
      const data = await res.json();
      return data.gallery;
    });

    const interiorImgSrc = await page.locator('#interiorPhoto img').getAttribute('src').catch(() => null);
    if (!apiGallery?.interior?.image_url) {
      failures.push('SHOP & STYLE: GET /site-contentのgallery.interiorが取得できない');
    } else if (interiorImgSrc !== apiGallery.interior.image_url) {
      failures.push(`SHOP & STYLE: 店内写真のsrcがAPIレスポンスと一致しない(表示=${interiorImgSrc}, API=${apiGallery.interior.image_url})`);
    }
    const styleCount = await page.locator('#styleGrid .style-card').count();
    const expectedStyleCount = apiGallery?.styles?.length;
    if (styleCount !== expectedStyleCount) {
      failures.push(`SHOP & STYLE: スタイル写真数がAPIレスポンスと一致しない(表示=${styleCount}, API=${expectedStyleCount})`);
    }

    const menuCount = await page.locator('#menuList .menu-item').count();
    if (menuCount !== 4) failures.push(`MENU & PRICE: 期待したメニュー数(4)と異なる: ${menuCount}`);
    const firstMenuPrice = await page.locator('#menuList .menu-item-price').first().textContent();
    if (!firstMenuPrice.includes('4,300')) failures.push(`MENU & PRICE: 先頭メニューの価格が想定と異なる: ${firstMenuPrice}`);

    const staffCount = await page.locator('#staffGrid .staff-card').count();
    if (staffCount !== 2) failures.push(`STAFF: 期待したスタッフ数(2)と異なる: ${staffCount}`);
    const staffNameText = await page.locator('#staffGrid .staff-name').first().textContent();
    if (!staffNameText.includes('スタイリスト')) failures.push(`STAFF: 先頭スタッフの氏名が想定と異なる: ${staffNameText}`);
    const staffRoleText = await page.locator('#staffGrid .staff-role').first().textContent();
    if (!staffRoleText.includes('理容歴4年')) failures.push(`STAFF: 肩書き(bio_role_label)が反映されていない: ${staffRoleText}`);

    // 評価バッジ(★スコア・口コミ件数)は管理画面から手動更新される値(site_ratingテーブル)なので、
    // 決め打ちの期待値ではなく、同じブラウザコンテキストから /site-content を直接叩いた結果と
    // 突き合わせる方式で検証する(admin.e2e.mjs側の手動更新と値がズレても誤検知しないため)。
    const apiRating = await page.evaluate(async () => {
      const { SUPABASE_URL, ANON_KEY } = window.CITY_DOGS_CONFIG;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/site-content`, {
        headers: { Authorization: `Bearer ${ANON_KEY}` },
      });
      const data = await res.json();
      return data.rating;
    });
    if (!apiRating || apiRating.score == null || apiRating.review_count == null) {
      failures.push('評価バッジ: GET /site-contentのratingがnullで検証できない');
    } else {
      const expectedScore = Number(apiRating.score).toFixed(2);
      const expectedCount = `(${apiRating.review_count}件の口コミ)`;
      const scoreText = (await page.locator('#ratingScore').textContent()).trim();
      const countText = (await page.locator('#ratingCount').textContent()).trim();
      if (scoreText !== expectedScore) failures.push(`評価バッジ: スコア表示が一致しない(表示=${scoreText}, 期待=${expectedScore})`);
      if (countText !== expectedCount) failures.push(`評価バッジ: 件数表示が一致しない(表示=${countText}, 期待=${expectedCount})`);
    }

    if (consoleErrors.length > 0) {
      failures.push(`ブラウザコンソールエラーが発生: ${consoleErrors.join(' / ')}`);
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
    killByPort(PORT);
  }

  if (failures.length > 0) {
    console.error('FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('OK: site-content.js経由のLP動的描画(CONCEPT/SHOP&STYLE/MENU&PRICE/STAFF)を確認しました。');
  }
}

run();
