/**
 * エントリーポイント。データを読み込み、検証し、画面を起動する。
 */
import { loadGameData } from './core/gameData.js';
import { SaveRepository } from './save/saveRepository.js';
import { browserLocalStorage } from './save/storageAdapters.js';
import { Session } from './game/session.js';
import { createApp } from './ui/app.js';
import { SCREENS } from './ui/screens/index.js';
import { CONFIG, isDebugEnabled } from './config.js';
import { h } from './ui/dom.js';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} を読み込めません（${res.status}）`);
  return res.json();
}

function renderFatal(root, title, lines) {
  root.replaceChildren(
    h(
      'section',
      { class: 'fatal' },
      h('h1', {}, title),
      h('ul', {}, lines.map((l) => h('li', {}, l))),
      h('p', { class: 'muted' }, '開発中の場合は npm run validate で詳細を確認できます。'),
    ),
  );
}

async function boot() {
  const root = document.getElementById('app');
  let data;
  try {
    data = await loadGameData(fetchJson, 'data/');
  } catch (e) {
    renderFatal(root, 'ゲームデータを読み込めませんでした', [e.message]);
    return;
  }
  const { errors, warnings } = data.validate();
  warnings.forEach((w) => console.warn(`[data] ${w}`));
  if (errors.length) {
    renderFatal(root, 'ゲームデータに問題があります', errors);
    return;
  }

  const repo = new SaveRepository(browserLocalStorage(), { key: CONFIG.saveKey });
  const session = new Session(data, repo);
  const ctx = createApp(root, session, SCREENS);
  ctx.debug = isDebugEnabled(window.location);
  ctx.go('title', {}, { reset: true });

  // 想定外のエラーはプレイヤーにも知らせる（セーブは最後に成功した操作の状態で残っている）
  const notify = (e) => {
    console.error(e);
    ctx.toast('予期しないエラーが起きました。再読み込みしてください', 'error');
  };
  window.addEventListener('error', (e) => notify(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => notify(e.reason));

  if (ctx.debug) {
    const { mountDebugPanel } = await import('./debug/debugPanel.js');
    mountDebugPanel(ctx);
    // コンソールからも触れるように（開発環境のみ）
    window.__game = { ctx, session, data };
  }
}

boot();
