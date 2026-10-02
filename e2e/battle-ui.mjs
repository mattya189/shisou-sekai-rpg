/**
 * 戦闘UIの画面確認（375×667 CSS px と、ブラウザのバーで高さが狭くなった 375×553）。
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:battle
 *
 * 確認すること:
 *   - 通常画面が縦横ともスクロールなしで収まる
 *   - 敵は上側・情報は立ち絵の上、味方は下側・情報は立ち絵の下。情報同士が重ならない
 *   - 3対3 / 敵1体 / ボス＋部位 / 長い名前 で破綻しない
 *   - 詳細・ログのパネル中は戦闘が進まない。手動停止中は閉じても止まったまま
 *   - タップ対象が44px以上、パネルが画面外へはみ出さない
 * スクリーンショットは e2e/shots/battle-*.png に保存される。
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT ?? 8098);
const URL = `http://localhost:${PORT}/`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright が見つかりません。npm i --no-save playwright && npx playwright install chromium を実行してください');
  process.exit(1);
}

const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const shots = path.join(root, 'e2e', 'shots');
await mkdir(shots, { recursive: true });
const browser = await chromium.launch();
const results = [];
const errors = [];
let failed = false;

async function check(name, fn) {
  try {
    await fn();
    results.push(`OK  ${name}`);
  } catch (e) {
    failed = true;
    results.push(`NG  ${name}: ${e.message.split('\n')[0]}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function openPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('text=はじめから');
  await page.waitForSelector('.town-screen');
  // ソメイムを含む3体編成にする（開発環境用の window.__game を使う）
  await page.evaluate(async () => {
    const { grantUnit } = await import('/src/progression/units.js');
    const { setPartySlot } = await import('/src/progression/party.js');
    const { session, data } = window.__game;
    const save = session.save;
    if (!save.units.mon_007) grantUnit(save, data, 'mon_007', { level: 40, rank: 5 });
    setPartySlot(save, data, 1, 'mon_007');
    session.commit();
  });
  return page;
}

async function startBattle(page, params) {
  await page.evaluate((p) => window.__game.ctx.go('battle', { mode: 'field', source: 'debug', seed: 5, ...p }), params);
  await page.waitForSelector('.battle-screen .bu');
}

/** 通常画面のレイアウト検査 */
async function layoutReport(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.scrollingElement;
    const rect = (el) => el.getBoundingClientRect();
    const field = rect(document.querySelector('.battle-field'));
    const units = [...document.querySelectorAll('.bu')].map((el) => ({
      side: el.classList.contains('bu-enemy') ? 'enemy' : 'ally',
      el: rect(el), fig: rect(el.querySelector('.bu-fig')), info: rect(el.querySelector('.bu-info')),
      name: el.querySelector('.bu-name').textContent,
      text: el.querySelector('.bu-info').textContent,
    }));
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const problems = [];
    if (doc.scrollHeight > vh + 1) problems.push(`縦スクロール ${doc.scrollHeight}>${vh}`);
    if (doc.scrollWidth > vw + 1) problems.push(`横スクロール ${doc.scrollWidth}>${vw}`);
    for (const u of units) {
      if (u.el.left < field.left - 1 || u.el.right > field.right + 1 || u.el.top < field.top - 1 || u.el.bottom > field.bottom + 1) problems.push(`${u.name} が戦場からはみ出し`);
      if (/null|undefined/.test(u.text)) problems.push(`${u.name} の情報に不正な文字列`);
      if (u.side === 'enemy' && !(u.info.bottom <= u.fig.top + 1)) problems.push(`${u.name} の情報が立ち絵の上にない`);
      if (u.side === 'ally' && !(u.info.top >= u.fig.bottom - 1)) problems.push(`${u.name} の情報が立ち絵の下にない`);
    }
    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) {
        const a = units[i];
        const b = units[j];
        if (overlap(a.info, b.info) > 4) problems.push(`${a.name} と ${b.name} の情報が重なる`);
        if (overlap(a.info, b.fig) > a.info.width * a.info.height * 0.15) problems.push(`${a.name} の情報が ${b.name} の立ち絵に重なる`);
      }
    }
    // 各陣営は横一直線（立ち絵の足元の高さがそろう）
    for (const side of ['enemy', 'ally']) {
      const feet = units.filter((u) => u.side === side).map((u) => Math.round(u.fig.bottom));
      if (feet.length > 1 && Math.max(...feet) - Math.min(...feet) > 2) problems.push(`${side} が一直線に並んでいない`);
    }
    const enemyBottom = Math.max(...units.filter((u) => u.side === 'enemy').map((u) => u.el.bottom));
    const allyTop = Math.min(...units.filter((u) => u.side === 'ally').map((u) => u.el.top));
    if (!(enemyBottom < allyTop)) problems.push('敵と味方の領域が重なる');
    const small = [...document.querySelectorAll('.battle-top button, .battle-bottom button')]
      .filter((b) => !b.closest('[hidden]'))
      .map((b) => [b.textContent, rect(b)]).filter(([, r]) => r.width < 44 || r.height < 44);
    if (small.length) problems.push(`44px未満のボタン: ${small.map(([t]) => t).join(',')}`);
    return { problems, gap: Math.round(allyTop - enemyBottom), field: Math.round(field.height) };
  });
}

const timeText = (page) => page.textContent('.battle-time');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (const [w, hgt, label] of [[375, 667, '375x667'], [375, 553, '375x553（ブラウザのバー表示時）'], [320, 568, '320x568']]) {
    const page = await openPage(w, hgt);
    await check(`${label}: 3対3 の通常画面`, async () => {
      await startBattle(page, { enemies: [{ defId: 'mon_001', level: 3 }, { defId: 'mon_002', level: 3 }, { defId: 'mon_003', level: 3 }] });
      await page.click('.speed-btn:text("×1")');
      await wait(2600);
      const r = await layoutReport(page);
      await page.screenshot({ path: path.join(shots, `battle-${w}x${hgt}-3v3.png`) });
      assert(!r.problems.length, r.problems.join(' / '));
      assert(r.gap >= 24, `中央の演出空間が狭い（${r.gap}px）`);
    });
    if (w === 375 && hgt === 667) {
      await check('詳細パネル: 開くと止まり、閉じると再開する', async () => {
        await page.click('.speed-btn:text("×3")');
        await page.click('.bu-enemy >> nth=1');
        await page.waitForSelector('.bsheet-detail');
        const t0 = await timeText(page);
        await wait(2200);
        assert(t0 === await timeText(page), 'パネル中に時間が進んだ');
        const box = await page.evaluate(() => {
          const r = document.querySelector('.bsheet-panel').getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, h: innerHeight, closeTop: document.querySelector('.bsheet-close').getBoundingClientRect().top };
        });
        assert(box.top >= 0 && box.bottom <= box.h + 1 && box.closeTop >= 0, 'パネルが画面外へはみ出す');
        await page.screenshot({ path: path.join(shots, 'battle-375x667-detail.png') });
        // 本文をスクロールしても見出しは残る
        await page.evaluate(() => { document.querySelector('.bsheet-body').scrollTop = 9999; });
        await page.screenshot({ path: path.join(shots, 'battle-375x667-detail-scrolled.png') });
        // 詳細 → ログへ切り替えても進まない
        await page.click('.bsheet-action:text("ログ")');
        await page.waitForSelector('.bsheet-log');
        await wait(1200);
        assert(t0 === await timeText(page), '切り替え時に時間が進んだ');
        await page.screenshot({ path: path.join(shots, 'battle-375x667-log.png') });
        await page.click('.bsheet-close');
        await wait(2200);
        assert(t0 !== await timeText(page), '閉じても再開しない');
      });
      await check('手動停止中はパネルを閉じても止まったまま', async () => {
        await page.click('.pause-btn');
        const t0 = await timeText(page);
        await page.click('.bu-ally >> nth=0');
        await page.waitForSelector('.bsheet-detail');
        await page.click('.bsheet-close');
        await wait(2200);
        assert(t0 === await timeText(page), '手動停止が解除された');
        assert(await page.isVisible('.halt-note'), '一時停止の表示がない');
        // ソメイムの詳細（倍数特技の次の条件到達・スタック・非攻撃特技）
        await page.click('.bu-ally >> nth=1');
        await page.waitForSelector('.bsheet-detail');
        await page.evaluate(() => { const b = document.querySelector('.bsheet-body'); b.scrollTop = b.querySelector('.bd-skills').offsetTop - 60; });
        await page.screenshot({ path: path.join(shots, 'battle-375x667-detail-someime.png') });
        assert(await page.locator('.bd-forecast:has-text("回目")').count() > 0, '次の条件到達が表示されない');
        await page.click('.bsheet-close');
        await page.click('.pause-btn');
      });
      await check('通常画面にログ本文を常時表示しない・結果画面からログを開ける', async () => {
        assert(await page.locator('.blog-line').count() === 0, '通常画面にログが出ている');
        await page.waitForSelector('.battle-result:not([hidden])', { timeout: 150000 });
        await page.click('.result-log');
        await page.waitForSelector('.bsheet-log .blog-line');
        await page.screenshot({ path: path.join(shots, 'battle-375x667-result-log.png') });
        await page.click('.bsheet-close');
        assert(await page.isVisible('.battle-result'), '結果画面が消えた');
      });
    }
    await page.close();
  }

  const page = await openPage(375, 667);
  await check('敵1体（中央寄せ）', async () => {
    await startBattle(page, { enemies: [{ defId: 'mon_002', level: 3 }] });
    await wait(800);
    const r = await layoutReport(page);
    await page.screenshot({ path: path.join(shots, 'battle-375x667-1enemy.png') });
    assert(!r.problems.length, r.problems.join(' / '));
  });
  await check('ボス＋部位', async () => {
    await page.evaluate(() => window.__game.ctx.go('battle', { enemies: [{ bossId: 'boss_001' }], mode: 'dungeon', source: 'debug', seed: 5 }));
    await page.waitForSelector('.bu.is-boss');
    await wait(800);
    const r = await layoutReport(page);
    await page.screenshot({ path: path.join(shots, 'battle-375x667-boss.png') });
    assert(!r.problems.length, r.problems.join(' / '));
  });
  await check('長い名前・画像読み込み失敗', async () => {
    await page.evaluate(() => {
      const m = window.__game.data.find('monsters', 'mon_003');
      m.name = 'とても長い名前のモンスターがここにいるよ';
      m.image = 'img/does-not-exist.png';
    });
    await startBattle(page, { enemies: [{ defId: 'mon_001', level: 3 }, { defId: 'mon_003', level: 3 }, { defId: 'mon_001', level: 3 }] });
    await wait(1200);
    const r = await layoutReport(page);
    await page.screenshot({ path: path.join(shots, 'battle-375x667-longname.png') });
    assert(!r.problems.length, r.problems.join(' / '));
    const broken = await page.evaluate(() => [...document.querySelectorAll('.bu-img')].filter((i) => i.complete && i.naturalWidth === 0).length);
    assert(broken === 0, '読み込み失敗の画像が仮表示に置き換わっていない');
  });
  await page.close();

  const reduced = await browser.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  const rp = await reduced.newPage();
  rp.on('pageerror', (e) => errors.push(String(e)));
  await check('動きを減らす設定でも戦闘が進み、行動者・対象の枠表示が出る', async () => {
    await rp.goto(URL);
    await rp.evaluate(() => localStorage.clear());
    await rp.reload();
    await rp.click('text=はじめから');
    await rp.waitForSelector('.town-screen');
    await startBattle(rp, { enemies: [{ defId: 'mon_001', level: 3 }, { defId: 'mon_002', level: 3 }, { defId: 'mon_003', level: 3 }] });
    await rp.waitForSelector('.bu.is-acting', { timeout: 8000 });
    await rp.screenshot({ path: path.join(shots, 'battle-375x667-reduced-motion.png') });
  });
  await reduced.close();
  // 「画像読み込み失敗」の確認で意図的に出す404は除く
  const realErrors = errors.filter((e) => !e.includes('404'));
  errors.length = 0;
  errors.push(...realErrors);
  if (errors.length) {
    failed = true;
    results.push(`NG  コンソールエラー: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(results.join('\n'));
console.log(failed ? '\n戦闘UI確認: 失敗あり' : '\n戦闘UI確認: すべて成功（e2e/shots/battle-*.png）');
process.exit(failed ? 1 : 0);
