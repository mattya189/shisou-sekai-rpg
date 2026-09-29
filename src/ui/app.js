/**
 * 画面の切り替えと共通レイアウト。
 *
 * 画面は src/ui/screens/ に置き、screens/index.js に登録する。
 * 画面モジュールの形:
 *   {
 *     nav: 'home' | 'adventure' | 'party' | 'inventory' | 'codex' | null,
 *     chrome: true,                                           // false なら上部バーと下部ナビを出さない
 *     render(ctx, params, state) { return HTMLElement },      // state は画面ごとの一時状態
 *   }
 * タイマーなどを使う画面は ctx.onCleanup(fn) で停止処理を登録する。
 */
import { h } from './dom.js';
import { periodName } from './format.js';
import { GameError } from '../core/errors.js';
import { weatherAt } from '../exploration/time.js';
import { staminaStatus, formatRecovery } from '../exploration/stamina.js';

const NAV_ITEMS = [
  { id: 'home', label: 'ホーム', screen: 'town' },
  { id: 'adventure', label: '冒険', screen: 'travel' },
  { id: 'party', label: '編成', screen: 'party' },
  { id: 'inventory', label: '所持品', screen: 'inventory' },
  { id: 'codex', label: '図鑑', screen: 'codex' },
];

export function createApp(root, session, screens) {
  const header = h('header', { class: 'topbar' });
  const main = h('main', { class: 'screen' });
  const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'メニュー' });
  const toastLayer = h('div', { class: 'toast-layer', 'aria-live': 'polite' });
  root.replaceChildren(h('div', { class: 'shell' }, header, main, nav), toastLayer);

  /** @type {{ name: string, params: any, state: any }[]} */
  let stack = [];
  /** 現在の画面を離れる・描き直すときに呼ぶ後片付け（タイマー停止など） */
  let cleanups = [];

  const ctx = {
    session,
    data: session.data,
    get save() {
      return session.save;
    },
    go,
    back,
    rerender: render,
    toast,
    /**
     * ロジック関数を実行し、成功したら保存して再描画する。
     * GameError はトーストで表示して false を返す。
     * @returns {boolean} 成功したか
     */
    act(fn, successMessage) {
      try {
        const result = fn();
        session.commit();
        if (successMessage) toast(typeof successMessage === 'function' ? successMessage(result) : successMessage);
        render();
        return true;
      } catch (e) {
        if (e instanceof GameError) {
          toast(e.message, 'error');
          return false;
        }
        throw e;
      }
    },
    canGoBack: () => stack.length > 1,
    /** 画面を離れる・描き直すときの後片付けを登録（アニメーションの停止など） */
    onCleanup(fn) {
      cleanups.push(fn);
    },
    /** 開発環境なら true（main.js が設定） */
    debug: false,
  };

  function go(name, params = {}, { replace = false, reset = false } = {}) {
    if (!screens[name]) throw new Error(`画面 ${name} は登録されていません`);
    const entry = { name, params, state: {} };
    if (reset) stack = [entry];
    else if (replace) stack[stack.length - 1] = entry;
    else stack.push(entry);
    render();
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function back() {
    if (stack.length > 1) stack.pop();
    render();
  }

  function render() {
    const top = stack[stack.length - 1];
    if (!top) return;
    for (const fn of cleanups.splice(0)) fn();
    const screen = screens[top.name];
    const chrome = screen.chrome !== false && session.save;
    root.classList.toggle('no-chrome', !chrome);
    header.replaceChildren(...(chrome ? renderTopbar() : []));
    nav.replaceChildren(...(chrome ? renderNav(screen.nav) : []));
    main.replaceChildren(screen.render(ctx, top.params, top.state));
  }

  function renderTopbar() {
    const { data, save } = session;
    const ex = save.exploration;
    const top = stack[stack.length - 1];
    const nodeId = top?.name === 'location' ? (top.params.locationId ?? ex.adventureId) : ex.townId;
    const place = data.findNode(nodeId);
    const weather = data.has('locations', nodeId) ? data.find('weathers', weatherAt(save, data, nodeId)) : null;
    const stamina = staminaStatus(save, data, session.now());
    return [
      h('span', { class: 'topbar-place' }, place?.name ?? '―'),
      h('span', { class: 'topbar-time' }, `${ex.time.day}日目 ${periodName(data, ex.time.period)}`, weather ? h('span', { class: 'topbar-weather' }, weather.name) : null),
      h(
        'span',
        { class: 'topbar-ap', 'aria-label': `スタミナ ${stamina.current}/${stamina.max}` },
        h('span', { class: 'topbar-ap-label' }, 'スタミナ'),
        h('strong', { class: 'topbar-stamina-value' }, `${stamina.current}/${stamina.max}`),
        h('span', { class: 'topbar-recovery' }, formatRecovery(stamina.nextRecoveryMs)),
      ),
    ];
  }

  function renderNav(active) {
    return NAV_ITEMS.map((item) => {
      const target = item.id === 'home' && session.save.dungeonRun ? 'dungeon' : item.screen;
      return h(
        'button',
        {
          type: 'button',
          class: `nav-item${item.id === active ? ' active' : ''}${item.planned ? ' planned' : ''}`,
          'aria-current': item.id === active ? 'page' : undefined,
          onClick: () => (target ? go(target, {}, { reset: true }) : toast(`${item.label}は${item.planned}で使えるようになります`)),
        },
        item.label,
      );
    });
  }

  setInterval(() => {
    if (!session.save || root.classList.contains('no-chrome')) return;
    const status = staminaStatus(session.save, session.data, session.now());
    if (status.recovered > 0) {
      session.commit();
      if (stack.at(-1)?.name === 'location') {
        render();
        return;
      }
    }
    const value = header.querySelector('.topbar-stamina-value');
    const countdown = header.querySelector('.topbar-recovery');
    const ap = header.querySelector('.topbar-ap');
    if (value) value.textContent = `${status.current}/${status.max}`;
    if (countdown) countdown.textContent = formatRecovery(status.nextRecoveryMs);
    if (ap) ap.setAttribute('aria-label', `スタミナ ${status.current}/${status.max}`);
  }, 1000);

  let toastTimer = null;
  function toast(message, kind = 'info') {
    const el = h('div', { class: `toast toast-${kind}` }, message);
    toastLayer.replaceChildren(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  return ctx;
}
