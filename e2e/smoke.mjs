/**
 * 画面の通しテスト（スマホ縦画面 390×844 で、主要な画面を順に操作する）。
 *
 * このリポジトリは依存ゼロなので、Playwright は必要なときだけ入れて使う:
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e
 *
 * 確認すること: 画面が開ける・操作が通る・ブラウザのコンソールにエラーが出ない・横スクロールが出ない。
 * スクリーンショットは e2e/shots/ に保存される（.gitignore 済み）。
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT ?? 8099);
const URL = `http://localhost:${PORT}/`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright が見つかりません。次を実行してから、もう一度 npm run e2e してください:\n  npm i --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const shots = path.join(root, 'e2e', 'shots');
await mkdir(shots, { recursive: true });

const errors = [];
const steps = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

async function step(name, fn) {
  try {
    await fn();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error('横スクロールが出ています');
    await page.screenshot({ path: path.join(shots, `${String(steps.length + 1).padStart(2, '0')}.png`) });
    steps.push(`OK  ${name}`);
  } catch (e) {
    steps.push(`NG  ${name}: ${e.message.split('\n')[0]}`);
    throw e;
  }
}

let failed = false;
try {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await step('タイトル → はじめから', async () => {
    await page.click('text=はじめから');
    await page.waitForSelector('.town-screen');
  });
  await step('住民と話す', async () => {
    await page.click('.facility:has-text("住民と話す")');
    await page.waitForSelector('.talk-box p');
    await page.click('text=街に戻る');
  });
  await step('ショップで買う', async () => {
    await page.click('.facility:has-text("ショップ")');
    await page.click('.shop-row >> nth=0 >> button >> nth=0');
    await page.click('text=街に戻る');
  });
  await step('街の外へ → 草原入口', async () => {
    await page.click('.facility-exit');
    await page.click('.travel-row >> nth=0');
    await page.waitForSelector('.location-screen');
  });
  await step('採取する', async () => {
    await page.click('.action-btn:has-text("採取する")');
    await page.waitForSelector('.explore-result');
  });
  await step('モンスターを探す → 戦闘（×4）→ 結果', async () => {
    await page.click('.action-btn:has-text("モンスターを探す")');
    await page.waitForSelector('.battle-screen');
    await page.click('.speed-btn:text("×4")');
    await page.waitForSelector('.battle-result:not([hidden])', { timeout: 120000 });
    await page.waitForSelector('.battle-report tbody tr');
    await page.click('.result-panel .btn-primary');
    await page.waitForSelector('.location-screen, .town-screen');
  });
  await step('編成 → 特技の優先順位を変える', async () => {
    await page.click('.nav-item:has-text("編成")');
    await page.click('.party-slot-main >> nth=0');
    await page.waitForSelector('.unit-head');
    await page.click('[aria-label="優先順位を下げる"] >> nth=0');
  });
  await step('所持品', async () => {
    await page.click('.nav-item:has-text("所持品")');
    await page.waitForSelector('.item-list, .empty');
  });
  await step('図鑑 → モンスター詳細', async () => {
    await page.click('.nav-item:has-text("図鑑")');
    await page.click('.codex-cell:not(.unknown) >> nth=0');
    await page.waitForSelector('.stage-track');
  });
  await step('再読み込みしても続きから遊べる', async () => {
    await page.reload();
    await page.click('text=続きから');
    await page.waitForSelector('.location-screen, .town-screen');
  });
  if (errors.length) throw new Error(`コンソールエラー: ${errors.join(' / ')}`);
} catch (e) {
  failed = true;
  if (!steps.at(-1)?.startsWith('NG')) steps.push(`NG  ${e.message}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(steps.join('\n'));
console.log(failed ? '\nE2E: 失敗' : `\nE2E: すべて成功（スクリーンショット: e2e/shots/）`);
process.exit(failed ? 1 : 0);
