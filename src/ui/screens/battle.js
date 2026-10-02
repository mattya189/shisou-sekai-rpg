/**
 * 戦闘画面。
 *
 * params:
 *   enemies : [{ defId, level }]  敵
 *   mode    : 'field' | 'dungeon'
 *   seed    : 省略時はランダム（同じseedなら同じ展開になる）
 *   source  : 'field'（探索中の戦闘。HP・報酬を反映）/ 'dungeon'（連戦。MPも持ち越し）/ 'debug'（報酬のみ反映、HPは変えない）
 *
 * 画面の構成（3対3、スマートフォン縦画面 375×667 CSS px 基準）:
 *   上部バー : 経過時間・ダンジョンの段階・効果音・ログ
 *   戦場     : 敵は上側（情報は立ち絵の上）、味方は下側（情報は立ち絵の下）。中央は演出用の空間
 *   下部バー : 一時停止／再開・速度
 *   パネル   : 敵味方のタップで詳細、ログボタンで戦闘ログ。どちらも開いている間は戦闘を止める
 *
 * 時間の進め方:
 *   エンジンは「進めた時間」だけで結果が決まり、刻み方に左右されない（src/battle/engine.js）。
 *   画面は nextEventTime() で「次の出来事の時刻」まで進め、その出来事の演出が終わるまで次へ進めない。
 *   これでHPバーなどの表示が、対応する出来事のタイミングでだけ変わる。戦闘結果は従来と同じ。
 *   ダメージ・攻撃回数・特技発動はUI側で計算し直さず、battle.log と戦闘状態をそのまま表示する。
 */
import { h } from '../dom.js';
import { unitImageSrc, placeholderSvg } from '../placeholder.js';
import { describeEvent } from '../battleLog.js';
import { buildBattleReport, effectPresentation, presentationCues, presentationDelayMs } from '../battlePresentation.js';
import { createBattleAudio, shouldPlayCue } from '../battleAudio.js';
import { createPauseController } from '../battlePause.js';
import { slotLayout } from '../battleLayout.js';
import { unitDetailModel, fieldStatusArea, logEventMeta, statusPolarity } from '../battleDetail.js';
import { createBattle, advance, nextEventTime, battleResult, sideOf, effectiveInterval } from '../../battle/engine.js';
import { alliesFromParty } from '../../battle/setup.js';
import { markMonster } from '../../progression/codex.js';
import { applyBattleOutcome } from '../../game/battleOutcome.js';
import { afterDungeonBattle, dungeonMp } from '../../exploration/dungeon.js';
import { aliveMembers } from '../../progression/hp.js';

const MAX_FRAME_MS = 250;
const MAX_FX_NODES = 24;
/** 演出待ちの上限。超えた分は軽い演出だけ即時に流し、待ちを溜めない（ログと状態は常に正確） */
const MAX_QUEUE = 6;
const LOG_PAGE = 150;

function bar(kind) {
  const fill = h('span', { class: 'bar-fill' });
  return { el: h('span', { class: `bar bar-${kind}` }, fill), fill };
}

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function pctWidth(value, max) {
  if (!(max > 0)) return '0%';
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

export default {
  nav: null,
  chrome: false,
  render(ctx, params, state) {
    const { data, session } = ctx;
    const save = session.save;
    const speeds = data.balance.battle.speeds;

    if (!state.battle) {
      state.battle = createBattle(data, {
        allies: alliesFromParty(save, data, { mp: params.source === 'dungeon' ? dungeonMp(save) : undefined }),
        enemies: params.enemies,
        mode: params.mode ?? 'field',
        seed: params.seed ?? session.rng.int(1, 2 ** 31 - 1),
      });
      const run = params.source === 'dungeon' ? save.dungeonRun : null;
      const dungeon = run ? data.find('dungeons', run.dungeonId) : null;
      state.stageLabel = dungeon ? `ステージ ${run.stage + 1}/${dungeon.stages.length}` : '';
      state.pause = createPauseController({ now: () => performance.now() });
      for (const e of params.enemies) markMonster(save, e.defId, 'encountered');
      session.commit();
    }
    const battle = state.battle;
    const pause = state.pause;
    // 開発環境だけ、コンソールや画面確認スクリプトから戦闘状態を見られるようにする
    if (ctx.debug) window.__battle = battle;
    const storedSpeed = Number(save.settings?.battleSpeed);
    let speed = speeds.includes(storedSpeed)
      ? storedSpeed
      : (speeds.filter((candidate) => candidate <= storedSpeed).at(-1) ?? speeds[0]);
    let soundEnabled = save.settings?.battleSoundEnabled !== false;
    let soundVolume = Number.isFinite(save.settings?.battleSoundVolume) ? Math.max(0, Math.min(1, save.settings.battleSoundVolume)) : 0.45;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** 演出（キュー・CSSアニメーション）を進めてよいか。勝敗確定後も、パネルや手動停止がなければ最後の演出は流す */
    const visualsRunning = () => !pause.isManuallyPaused() && pause.panel() === null;

    // ---- ユニット（立ち絵＋紐づく情報） ----
    const views = new Map();

    function portrait(u) {
      const kind = u.isPart ? 'monster' : u.kind;
      const id = u.isPart ? `${u.defId}_${u.partKey}` : u.defId;
      const fallback = placeholderSvg(id, u.name, kind);
      return h('img', {
        class: 'bu-img',
        src: unitImageSrc({ id, name: u.name, image: u.image }, kind),
        alt: '',
        draggable: 'false',
        onError: (event) => {
          if (event.target.src !== fallback) event.target.src = fallback;
        },
      });
    }

    function unitView(u, slot) {
      const isEnemy = u.side === 'enemy';
      const hp = bar('hp');
      const mp = !isEnemy && u.usesMp && u.maxMp > 0 ? bar('mp') : null;
      const next = !isEnemy && Number.isFinite(u.stats?.attackIntervalMs) ? bar('next') : null;
      const brk = u.boss?.break ? bar('break') : null;
      const count = h('span', { class: 'bu-count', 'aria-hidden': 'true' });
      const badges = h('span', { class: 'bu-badges' });
      const stacks = h('span', { class: 'bu-stacks' });
      const alert = u.boss ? h('span', { class: 'bu-alert', 'aria-live': 'polite' }) : null;
      const tag = h('span', { class: 'bu-tag', 'aria-hidden': 'true' });
      const fig = h('span', { class: 'bu-fig' }, h('span', { class: 'bu-shadow', 'aria-hidden': 'true' }), portrait(u), tag);
      const hpText = h('span', { class: 'bu-num' });
      const mpText = mp ? h('span', { class: 'bu-num' }) : null;
      const meter = (label, b, text) => h('span', { class: 'bu-meter' }, h('span', { class: 'bu-meter-label' }, label), b.el, text);
      const info = h(
        'span',
        { class: 'bu-info' },
        // 戦場では仮名の接頭辞「（仮）」を省いて短くする。全文は詳細パネルに出す
        h('span', { class: 'bu-line' }, h('span', { class: 'bu-name', title: u.name }, u.name.replace(/^（仮）/, '')), count),
        meter('HP', hp, hpText),
        mp ? meter('MP', mp, mpText) : null,
        next ? h('span', { class: 'bu-subbars', title: '次の行動まで' }, next.el) : null,
        brk ? h('span', { class: 'bu-subbars', title: 'BREAKゲージ' }, brk.el) : null,
        alert,
        badges,
        stacks,
      );
      const el = h(
        'button',
        {
          type: 'button',
          class: `bu bu-${u.side}${u.boss ? ' is-boss' : ''}${u.isPart ? ' is-part' : ''}`,
          'aria-label': `${isEnemy ? '敵' : '味方'}「${u.name}」の詳しい状況を見る`,
          onClick: () => openDetail(u.id, el),
        },
        isEnemy ? info : fig,
        isEnemy ? fig : info,
      );
      el.style.setProperty('--x', slot.x);
      el.style.setProperty('--d', slot.depth);
      el.style.zIndex = String(10 + Math.round(slot.depth * 10));
      const view = { el, fig, hp, mp, hpText, mpText, next, brk, count, stacks, badges, alert, tag, badgeKey: '', alive: u.alive, stackCapacity: 2 };
      // スタック欄は情報欄の空いている部分だけを使う。入る行数は表示サイズから決め、画面サイズが変わったら数え直す
      stackObserver?.observe(stacks);
      views.set(u.id, view);
      return el;
    }

    const STACK_ROW = 17;
    const STACK_GAP = 2;
    const stackCapacityOf = (el) => Math.max(1, Math.floor((el.clientHeight + STACK_GAP) / (STACK_ROW + STACK_GAP))) * 2;
    const stackObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          for (const view of views.values()) {
            if (view.stacks !== entry.target) continue;
            const capacity = stackCapacityOf(view.stacks);
            if (capacity !== view.stackCapacity) {
              view.stackCapacity = capacity;
              view.badgeKey = '';
            }
          }
        }
      })
      : null;
    ctx.onCleanup(() => stackObserver?.disconnect());

    const enemies = sideOf(battle, 'enemy');
    const allies = sideOf(battle, 'ally');
    const enemyLayout = slotLayout(enemies);
    const allyLayout = slotLayout(allies);

    // ---- 上部・下部の操作 ----
    const timeText = h('span', { class: 'battle-time' });
    const logButton = h('button', { type: 'button', class: 'bt-btn bt-log', onClick: () => openLog() }, 'ログ');
    const soundButton = h('button', {
      type: 'button',
      class: 'bt-btn bt-sound',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      onClick: () => toggleSoundPop(),
    });
    const soundToggle = h('button', {
      type: 'button',
      class: 'sound-toggle',
      onClick: () => {
        soundEnabled = !soundEnabled;
        save.settings = { ...(save.settings ?? {}), battleSoundEnabled: soundEnabled, battleSoundVolume: soundVolume };
        session.commit();
        updateSoundControls();
        if (soundEnabled) audio.resume();
      },
    });
    const volumeText = h('span', { class: 'sound-volume-text' });
    const volumeInput = h('input', {
      class: 'sound-volume',
      type: 'range',
      min: 0,
      max: 100,
      step: 5,
      value: Math.round(soundVolume * 100),
      'aria-label': '戦闘効果音の音量',
      onInput: (event) => {
        soundVolume = Number(event.target.value) / 100;
        save.settings = { ...(save.settings ?? {}), battleSoundVolume: soundVolume };
        updateSoundControls();
      },
      onChange: () => session.commit(),
    });
    const soundPop = h('div', { class: 'sound-pop', hidden: true, role: 'group', 'aria-label': '効果音' },
      h('span', { class: 'sound-label' }, '効果音'), soundToggle, volumeInput, volumeText);

    const speedButtons = speeds.map((s) =>
      h('button', {
        type: 'button',
        class: 'speed-btn',
        'aria-pressed': 'false',
        'aria-label': `速度${s}倍`,
        onClick: () => {
          speed = s;
          save.settings = { ...(save.settings ?? {}), battleSpeed: s };
          session.commit();
          paintControls();
        },
      }, `×${s}`));
    const pauseBtn = h('button', {
      type: 'button',
      class: 'pause-btn',
      onClick: () => {
        pause.toggleManual();
        paintControls();
      },
    });

    const banner = h('div', { class: 'skill-banner', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const fxLayer = h('div', { class: 'fx-layer', 'aria-hidden': 'true' });
    const haltNote = h('div', { class: 'halt-note', hidden: true }, '一時停止中');
    const stage = h(
      'div',
      { class: `battle-field enemies-${enemies.length} allies-${allies.length}`, role: 'group', 'aria-label': '戦場' },
      h('div', { class: 'field-ground field-ground-enemy', 'aria-hidden': 'true' }),
      h('div', { class: 'field-ground field-ground-ally', 'aria-hidden': 'true' }),
      h('div', { class: 'field-side field-enemies' }, enemies.map((u, i) => unitView(u, enemyLayout[i]))),
      h('div', { class: 'field-side field-allies' }, allies.map((u, i) => unitView(u, allyLayout[i]))),
      fxLayer,
      banner,
      haltNote,
    );

    const resultLayer = h('div', { class: 'battle-result', hidden: true });
    const sheetLayer = h('div', { class: 'bsheet', hidden: true });

    const root = h(
      'section',
      { class: 'battle-screen', onPointerdown: () => audio.resume() },
      h('header', { class: 'battle-top' },
        timeText,
        state.stageLabel ? h('span', { class: 'battle-stage-label' }, state.stageLabel) : null,
        h('span', { class: 'battle-top-spacer' }),
        soundButton,
        logButton,
        soundPop,
      ),
      stage,
      h('footer', { class: 'battle-bottom' },
        pauseBtn,
        h('span', { class: 'speed-group', role: 'group', 'aria-label': '戦闘速度' }, speedButtons),
      ),
      resultLayer,
      sheetLayer,
    );

    const fxTimers = new Set();
    const presentationQueue = [];
    let processedLog = battle.log.length;
    let nextPresentationAt = 0;
    let cueSerial = 0;
    const audio = createBattleAudio({ enabled: () => soundEnabled, volume: () => soundVolume });
    audio.resume();

    document.documentElement.classList.add('battle-open');
    ctx.onCleanup(() => document.documentElement.classList.remove('battle-open'));

    // 停止していた間は演出の待ち時間もずらす（再開した瞬間に溜まった演出を一気に流さない）
    const offResume = pause.onResume((pausedMs) => {
      nextPresentationAt += pausedMs;
    });
    ctx.onCleanup(offResume);

    function updateSoundControls() {
      soundButton.textContent = soundEnabled ? '🔊' : '🔇';
      soundButton.setAttribute('aria-label', `効果音の設定（現在${soundEnabled ? 'オン' : 'オフ'}）`);
      soundToggle.textContent = soundEnabled ? 'ON' : 'OFF';
      soundToggle.setAttribute('aria-pressed', String(soundEnabled));
      volumeInput.disabled = !soundEnabled;
      volumeText.textContent = `${Math.round(soundVolume * 100)}%`;
    }
    updateSoundControls();

    function toggleSoundPop(force) {
      const open = force ?? soundPop.hidden;
      soundPop.hidden = !open;
      soundButton.setAttribute('aria-expanded', String(open));
    }

    function later(fn, ms) {
      const timer = setTimeout(() => {
        fxTimers.delete(timer);
        fn();
      }, ms);
      fxTimers.add(timer);
    }

    /** CSSアニメーション（動きを減らす設定では何もしない） */
    function pulse(el, className, ms = 520) {
      if (!el || reducedMotion) return;
      el.classList.remove(className);
      void el.offsetWidth;
      el.classList.add(className);
      later(() => el.classList.remove(className), ms);
    }

    /** 動きのない強調（枠・発光）。動きを減らす設定でも「誰が誰に」を伝えるために常に使う */
    function mark(el, className, ms) {
      if (!el) return;
      el.classList.add(className);
      later(() => el.classList.remove(className), ms);
    }

    function floatText(view, text, kind) {
      if (!view) return;
      while (root.querySelectorAll('.battle-float').length >= MAX_FX_NODES) root.querySelector('.battle-float')?.remove();
      // 同じユニットに重なる数字は少しずつずらす
      const stack = view.fig.querySelectorAll('.battle-float').length;
      const node = h('span', { class: `battle-float float-${kind}`, 'aria-hidden': 'true' }, text);
      node.style.setProperty('--stack', String(stack % 3));
      view.fig.append(node);
      node.addEventListener('animationend', () => node.remove(), { once: true });
      later(() => node.remove(), 1200);
    }

    function showTag(view, text, kind, ms = 900) {
      if (!view || !text) return;
      view.tag.textContent = text;
      view.tag.className = `bu-tag show tag-${kind}`;
      const shown = text;
      later(() => {
        if (view.tag.textContent === shown) view.tag.className = 'bu-tag';
      }, ms);
    }

    function spawnParticles(view, cue, serial) {
      if (!view || reducedMotion || !shouldPlayCue(cue, speed, serial)) return;
      while (root.querySelectorAll('.battle-particle-burst').length >= MAX_FX_NODES) root.querySelector('.battle-particle-burst')?.remove();
      const presentation = effectPresentation(cue, data);
      const tierCount = cue.tier === 'ultimate' ? 16 : cue.tier === 'combo' ? 13 : cue.tier === 'skill' ? 10 : 7;
      const count = speed >= 2 ? Math.min(8, tierCount) : tierCount;
      const burst = h('span', { class: `battle-particle-burst particle-${presentation.particle}`, 'aria-hidden': 'true' });
      burst.style.setProperty('--particle-color', presentation.color);
      burst.style.setProperty('--particle-accent', presentation.accent);
      burst.style.setProperty('--particle-duration', `${Math.round((cue.tier === 'ultimate' ? 900 : 650) / Math.sqrt(Math.max(1, speed)))}ms`);
      for (let i = 0; i < count; i += 1) {
        const particle = h('i');
        particle.style.setProperty('--particle-angle', `${(360 / count) * i + (serial % 4) * 9}deg`);
        particle.style.setProperty('--particle-distance', `${22 + ((i * 11 + serial * 7) % 28)}px`);
        particle.style.setProperty('--particle-delay', `${(i % 4) * 18}ms`);
        burst.append(particle);
      }
      view.fig.append(burst);
      burst.addEventListener('animationend', (event) => {
        if (event.target === burst) burst.remove();
      });
      later(() => burst.remove(), 1100);
    }

    /** 攻撃者から対象への短い軌跡。立ち絵は動かさず、線だけで「誰が誰に」を示す */
    function trail(fromView, toView, kind) {
      if (!fromView || !toView || fromView === toView || reducedMotion) return;
      while (fxLayer.childElementCount >= MAX_FX_NODES) fxLayer.firstElementChild?.remove();
      const base = stage.getBoundingClientRect();
      const a = fromView.fig.getBoundingClientRect();
      const b = toView.fig.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - base.left;
      const y1 = a.top + a.height * 0.55 - base.top;
      const x2 = b.left + b.width / 2 - base.left;
      const y2 = b.top + b.height * 0.55 - base.top;
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (!(length > 4)) return;
      const node = h('span', { class: `fx-trail trail-${kind}` });
      node.style.left = `${x1}px`;
      node.style.top = `${y1}px`;
      node.style.width = `${length}px`;
      node.style.transform = `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
      node.style.setProperty('--trail-ms', `${Math.round(320 / Math.sqrt(Math.max(1, speed)))}ms`);
      fxLayer.append(node);
      node.addEventListener('animationend', () => node.remove(), { once: true });
      later(() => node.remove(), 700);
    }

    function showBanner(label, tier) {
      if (!label) return;
      banner.textContent = label;
      banner.className = `skill-banner show tier-${tier}`;
      pulse(banner, 'banner-pop', tier === 'ultimate' ? 1000 : 700);
      later(() => {
        if (banner.textContent === label) banner.className = 'skill-banner';
      }, tier === 'ultimate' ? 1200 : 850);
    }

    function statusLabel(statusId) {
      const def = data.find('statuses', statusId);
      const name = def?.name?.replace(/^（仮）/, '') ?? statusId;
      const polarity = statusPolarity(def);
      return { text: `${polarity === 'buff' ? '▲' : polarity === 'debuff' ? '▼' : ''}${name}`, kind: polarity === 'buff' ? 'buff' : 'status' };
    }

    /** 1つの出来事の演出をまとめて流す。lite は待ちが溜まったときの軽量版（軌跡・技名帯を省く） */
    function renderGroup(cues, { lite = false } = {}) {
      const tagDelay = cues.some((c) => c.type === 'countTrigger') && !lite ? Math.round(260 / Math.sqrt(speed)) : 0;
      for (const cue of cues) renderCue(cue, { lite, tagDelay });
    }

    function renderCue(cue, { lite, tagDelay }) {
      cueSerial += 1;
      if (!lite) audio.play(cue, data, speed, cueSerial);
      const view = views.get(cue.targetId);
      if (cue.type === 'action') {
        mark(view?.el, 'is-acting', 420);
        if (!lite) pulse(view?.fig, `motion-${cue.tier}`, cue.tier === 'ultimate' ? 900 : 520);
        for (const targetId of cue.targetIds ?? []) {
          mark(views.get(targetId)?.el, 'is-target', 420);
          if (!lite) trail(view, views.get(targetId), cue.presentationType === 'heal' ? 'heal' : cue.presentationType === 'projectile' ? 'magic' : 'hit');
        }
        if (cue.countsAsAttack && cue.tier !== 'normal') pulse(view?.count, 'count-trigger', 700);
      } else if (cue.type === 'countTrigger') {
        if (!lite) showTag(view, cue.label, 'count', 700);
        pulse(view?.count, 'count-trigger', 700);
      } else if (cue.type === 'banner') {
        const show = () => {
          showTag(view, cue.label, cue.tier, cue.tier === 'ultimate' ? 1300 : 1000);
          if (!lite && (cue.tier === 'ultimate' || cue.tier === 'combo')) showBanner(cue.label, cue.tier);
        };
        if (tagDelay) later(show, tagDelay);
        else show();
      } else if (cue.type === 'damage') {
        floatText(view, cue.critical ? `${cue.amount}!` : cue.amount, cue.dot ? 'dot' : cue.critical ? 'crit' : 'damage');
        mark(view?.el, 'is-hit', 300);
        pulse(view?.fig, cue.critical ? 'motion-crit' : 'motion-hit', 380);
        if (!lite) spawnParticles(view, cue, cueSerial);
      } else if (cue.type === 'heal') {
        floatText(view, `+${cue.amount}`, 'heal');
        mark(view?.el, 'is-healed', 500);
        if (!lite) spawnParticles(view, cue, cueSerial);
      } else if (cue.type === 'miss') {
        floatText(view, 'MISS', 'miss');
        pulse(view?.fig, 'motion-dodge', 500);
      } else if (cue.type === 'marker') {
        const name = data.find('markers', cue.markerId)?.name ?? cue.markerId;
        floatText(view, `${name}${cue.amount > 0 ? '+' : ''}${cue.amount}`, 'marker');
        mark(view?.stacks.querySelector(`[data-marker="${cue.markerId}"]`), 'stack-changed', 600);
        if (!lite) spawnParticles(view, cue, cueSerial);
      } else if (cue.type === 'status') {
        const label = statusLabel(cue.statusId);
        floatText(view, label.text, label.kind);
        mark(view?.badges, 'badges-changed', 600);
        if (!lite) spawnParticles(view, cue, cueSerial);
      } else if (cue.type === 'attackCount') {
        floatText(view, `攻撃回数+${cue.amount}`, 'count');
        pulse(view?.count, 'count-trigger', 700);
      } else if (cue.type === 'comboQueued') {
        floatText(view, '連携準備', 'combo');
      } else if (cue.type === 'combo') {
        const name = data.find('skills', cue.skillId)?.name ?? '連携発動';
        showTag(view, name, 'combo', 1000);
        if (!lite) showBanner(name, 'combo');
        pulse(view?.fig, 'motion-combo', 750);
      } else if (cue.type === 'break') {
        floatText(view, 'BREAK!', 'break');
        if (!lite) spawnParticles(view, cue, cueSerial);
      } else if (cue.type === 'defeat') {
        pulse(view?.fig, 'motion-ko', 700);
      }
    }

    function collectNewEvents() {
      const events = battle.log.slice(processedLog);
      processedLog = battle.log.length;
      for (const event of events) {
        const cues = presentationCues(event, battle, data);
        if (cues.length) presentationQueue.push(cues);
      }
      // 待ちが溜まりすぎたら古い分は軽い演出で即時に流す（状態・ログは影響を受けない）
      while (presentationQueue.length > MAX_QUEUE) renderGroup(presentationQueue.shift(), { lite: true });
    }

    function presentNext(now) {
      if (!presentationQueue.length || now < nextPresentationAt || !visualsRunning()) return;
      const cues = presentationQueue.shift();
      renderGroup(cues);
      nextPresentationAt = now + presentationDelayMs(speed, cues);
    }

    // ---- 描画 ----
    function paintControls() {
      speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(speeds[i] === speed)));
      const manual = pause.isManuallyPaused();
      pauseBtn.textContent = manual ? '▶ 再開' : 'Ⅱ 一時停止';
      pauseBtn.setAttribute('aria-pressed', String(manual));
      pauseBtn.disabled = Boolean(battle.outcome);
      const halted = !visualsRunning();
      root.classList.toggle('is-halted', halted);
      haltNote.hidden = !(manual && !battle.outcome);
    }

    function paintBadges(u, view) {
      // スタックは空いている欄に入るだけ（2列×入る行数）。入りきらない分は最後のマスを「+件数」にする。ゲージは描かず数値だけ
      const capacity = view.stackCapacity;
      const area = fieldStatusArea(u, data, { stackLimit: capacity, statusLimit: 3 });
      const key = JSON.stringify([capacity, area]);
      if (key === view.badgeKey) return;
      view.badgeKey = key;
      const shown = area.hiddenStacks ? area.stacks.slice(0, capacity - 1) : area.stacks;
      const more = area.hiddenStacks + area.stacks.length - shown.length;
      // replaceChildren は null を文字列 "null" にしてしまうため、必ず要素だけを渡す
      const cells = shown.map((m) => h('span', { class: `bu-stack${m.isMax ? ' is-max' : ''}`, dataset: { marker: m.id }, title: `${m.name} ${m.value}${m.max != null ? `/${m.max}` : ''}` },
        h('span', { class: 'bu-stack-name' }, m.name),
        h('strong', { class: 'bu-stack-value' }, String(m.value))));
      if (more) cells.push(h('span', { class: 'bu-stack bu-stack-more' }, `+${more}`));
      view.stacks.replaceChildren(...cells);
      const chips = area.statuses.map((b) => h('span', { class: `bu-badge badge-${b.kind}` },
        h('span', { class: 'bu-badge-name' }, b.label),
        b.value !== '' ? h('strong', {}, b.value) : null));
      if (area.hiddenStatuses) chips.push(h('span', { class: 'bu-badge badge-more' }, `+${area.hiddenStatuses}`));
      view.badges.replaceChildren(...chips);
    }

    function paint(now = performance.now()) {
      timeText.textContent = `経過 ${clock(battle.timeMs)}`;
      paintControls();

      for (const u of battle.units) {
        const v = views.get(u.id);
        v.el.classList.toggle('down', !u.alive);
        if (!v.alive && u.alive) {
          // 蘇生（現在のエンジンに蘇生効果はないが、状態が戻ったら必ず表示を戻す）
          floatText(v, '復帰', 'heal');
          mark(v.el, 'is-revived', 900);
        }
        v.alive = u.alive;
        v.hp.fill.style.width = pctWidth(u.hp, u.maxHp);
        v.hp.el.classList.toggle('is-low', u.alive && u.hp / u.maxHp <= 0.3);
        v.hpText.textContent = `${u.hp}/${u.maxHp}`;
        if (v.mp) {
          v.mp.fill.style.width = pctWidth(u.mp, u.maxMp);
          v.mpText.textContent = `${u.mp}/${u.maxMp}`;
        }
        if (v.next) {
          const interval = effectiveInterval(u);
          const progress = u.alive ? 1 - Math.max(0, u.nextAttackAt - battle.timeMs) / interval : 0;
          v.next.fill.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
        }
        if (v.brk) v.brk.fill.style.width = `${u.broken ? 0 : (u.boss.break.gauge / u.boss.break.max) * 100}%`;
        if (v.alert) {
          v.alert.textContent = u.broken ? 'BREAK!' : u.charging ? '力をためている！' : '';
          v.el.classList.toggle('charging', Boolean(u.charging));
          v.el.classList.toggle('broken', Boolean(u.broken));
        }
        v.count.textContent = !u.alive ? (u.side === 'ally' ? '戦闘不能' : '撃破') : u.isPart ? '部位' : `攻${u.attackCount}`;
        paintBadges(u, v);
      }

      collectNewEvents();
      presentNext(now);

      if (battle.outcome && !presentationQueue.length && now >= nextPresentationAt && visualsRunning()) showResult();
    }

    // ---- 詳細・ログのパネル（下から開く。開いている間は戦闘を止める） ----
    let sheetReturnFocus = null;

    function sheet({ title, subtitle, actions = [], body, kind }) {
      const closeBtn = h('button', { type: 'button', class: 'bsheet-close', 'aria-label': '閉じる', onClick: () => closeSheet() }, '×');
      const scroller = h('div', { class: 'bsheet-body' }, body);
      const panel = h(
        'div',
        { class: `bsheet-panel bsheet-${kind}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'bsheet-head' },
          h('div', { class: 'bsheet-titles' }, h('h2', { class: 'bsheet-title' }, title), subtitle ? h('p', { class: 'bsheet-sub' }, subtitle) : null),
          actions,
          closeBtn),
        scroller,
      );
      sheetLayer.replaceChildren(h('div', { class: 'bsheet-backdrop', onClick: () => closeSheet() }), panel);
      sheetLayer.hidden = false;
      closeBtn.focus({ preventScroll: true });
      return scroller;
    }

    function closeSheet() {
      if (sheetLayer.hidden) return;
      sheetLayer.hidden = true;
      sheetLayer.replaceChildren();
      pause.closePanel();
      paintControls();
      sheetReturnFocus?.focus?.({ preventScroll: true });
      sheetReturnFocus = null;
    }

    function onKey(event) {
      if (event.key === 'Escape' && !sheetLayer.hidden) closeSheet();
    }
    document.addEventListener('keydown', onKey);
    ctx.onCleanup(() => document.removeEventListener('keydown', onKey));

    const section = (title, ...children) => h('section', { class: 'bd-section' }, h('h3', { class: 'bd-h' }, title), children);
    const none = () => h('p', { class: 'bd-none' }, 'なし');

    function openDetail(unitId, returnFocus) {
      const unit = battle.units.find((u) => u.id === unitId);
      if (!unit) return;
      toggleSoundPop(false);
      sheetReturnFocus = returnFocus ?? sheetReturnFocus;
      pause.openPanel('detail');
      paintControls();
      const m = unitDetailModel(unit, battle, data);
      const subtitle = [m.sideLabel, m.rank != null ? `☆${m.rank}` : null, m.level != null ? `Lv.${m.level}` : null, m.alive ? null : (unit.side === 'ally' ? '戦闘不能' : '撃破済み')].filter(Boolean).join('・');

      const gauge = (label, value, max, kind) => h('div', { class: 'bd-gauge' },
        h('span', { class: 'bd-gauge-label' }, label),
        h('span', { class: `bar bar-${kind}` }, h('span', { class: 'bar-fill', style: { width: pctWidth(value, max) } })),
        h('span', { class: 'bd-gauge-num' }, `${value} / ${max}`));

      const body = [
        h('div', { class: 'bd-gauges' },
          gauge('HP', m.hp, m.maxHp, 'hp'),
          m.mp != null ? gauge('MP', m.mp, m.maxMp, 'mp') : null),
        section('行動',
          h('dl', { class: 'bd-kv' },
            h('div', {}, h('dt', {}, '行動回数'), h('dd', {}, `${m.turnCount}回`, h('small', {}, '攻撃・回復・待機などすべての行動'))),
            h('div', {}, h('dt', {}, '攻撃回数'), h('dd', {}, `${m.attackCount}回`, h('small', {}, '攻撃として成立した行動だけ'))),
            m.timing.map((t) => h('div', {}, h('dt', {}, t.label), h('dd', {}, t.value))))),
        m.stats.length ? section('能力値（現在）',
          h('dl', { class: 'bd-kv bd-stats' }, m.stats.map((s) => h('div', { class: s.changed ? 'is-changed' : '' },
            h('dt', {}, s.label),
            h('dd', {}, String(s.value), s.changed ? h('small', {}, `基本 ${s.key === 'evasion' ? `${s.base}%` : s.base}`) : null))))) : null,
        section('スタック', m.markers.length
          ? h('ul', { class: 'bd-list' }, m.markers.map((mk) => h('li', {}, h('strong', {}, mk.name), ` ${mk.value}${mk.max != null ? ` / ${mk.max}` : ''}`, mk.max != null && mk.value >= mk.max ? h('span', { class: 'bd-tag tag-max' }, 'MAX') : null)))
          : none()),
        section('状態（バフ・デバフ・状態異常）', m.statuses.length
          ? h('ul', { class: 'bd-list' }, m.statuses.map((s) => h('li', {},
            h('strong', {}, s.name),
            h('span', { class: `bd-tag tag-${s.polarity}` }, s.polarity === 'buff' ? '有利' : s.polarity === 'debuff' ? '不利' : '効果'),
            s.description ? h('p', {}, s.description) : null,
            h('p', { class: 'bd-remaining' }, s.remaining.long))))
          : none()),
        section('パッシブ（常に発動中）', m.passives.length
          ? h('ul', { class: 'bd-list' }, m.passives.map((p) => h('li', {}, h('strong', {}, p.name), p.effects.map((e) => h('p', {}, e)))))
          : none()),
        section('特技（上ほど優先）', m.skills.length
          ? h('ol', { class: 'bd-list bd-skills' }, m.skills.map((s) => h('li', {},
            h('div', { class: 'bd-skill-head' }, h('strong', {}, s.name), h('span', { class: 'bd-mp' }, `MP ${s.mpCost}`), s.countsAsAttack ? null : h('span', { class: 'bd-tag' }, '非攻撃')),
            s.trigger ? h('p', {}, `条件：${s.trigger}`) : null,
            s.forecast ? h('p', { class: 'bd-forecast' }, s.forecast) : null,
            s.blockers.map((b) => h('p', { class: 'bd-blocker' }, b)))))
          : none()),
        m.skills.some((s) => s.category === 'attackCount')
          ? h('p', { class: 'bd-note' }, '「次の条件到達」は目安です。MP・ほかの条件・優先順位によって、到達しても発動しないことがあります。')
          : null,
        section('戦闘状況', m.situation.length ? h('ul', { class: 'bd-list' }, m.situation.map((t) => h('li', {}, t))) : none()),
      ];
      sheet({
        kind: 'detail',
        title: m.name,
        subtitle,
        actions: [h('button', { type: 'button', class: 'bsheet-action', onClick: () => openLog() }, 'ログ')],
        body,
      });
    }

    function logLine(event) {
      const text = describeEvent(event, battle, data);
      if (!text) return null;
      const meta = logEventMeta(event);
      const actor = event.actorId ? battle.units.find((u) => u.id === event.actorId) : null;
      return h('li', { class: `blog-line${actor ? ` blog-${actor.side}` : ''}${event.type === 'end' ? ' blog-end' : ''}` },
        h('span', { class: 'blog-time' }, clock(event.t ?? 0)),
        h('span', { class: 'blog-text' }, text, meta ? h('small', {}, `（${meta}）`) : null));
    }

    function openLog() {
      toggleSoundPop(false);
      sheetReturnFocus = sheetReturnFocus ?? logButton;
      // 詳細から切り替えるときも panel は null を経由しないので、戦闘は一瞬も再開しない
      pause.openPanel('log');
      paintControls();
      const list = h('ol', { class: 'blog' });
      // 戦闘ログ本体（battle.log）は削らない。表示だけを新しい順に区切って読み込む
      let shownFrom = battle.log.length;
      const moreBtn = h('button', { type: 'button', class: 'btn blog-more', onClick: () => loadOlder() }, 'さらに前を表示');
      function loadOlder() {
        const from = Math.max(0, shownFrom - LOG_PAGE);
        const items = battle.log.slice(from, shownFrom).map(logLine).filter(Boolean);
        list.prepend(...items);
        shownFrom = from;
        moreBtn.hidden = shownFrom === 0;
      }
      loadOlder();
      const scroller = sheet({
        kind: 'log',
        title: '戦闘ログ',
        subtitle: `${battle.outcome ? '戦闘終了' : '一時停止中'}・経過 ${clock(battle.timeMs)}`,
        actions: [h('button', { type: 'button', class: 'bsheet-action', onClick: () => { scroller.scrollTop = scroller.scrollHeight; } }, '最新へ')],
        body: [moreBtn, list],
      });
      scroller.scrollTop = scroller.scrollHeight;
    }

    function showResult() {
      if (!state.summary) {
        state.summary = applyBattleOutcome(save, data, battle, session.rng, { applyHp: params.source !== 'debug' });
        if (params.source === 'dungeon') state.dungeon = afterDungeonBattle(save, data, battle);
        session.commit();
      }
      if (!resultLayer.hidden) return;
      toggleSoundPop(false);
      const r = battleResult(battle);
      cueSerial += 1;
      audio.play({ type: 'outcome', outcome: r.outcome }, data, speed, cueSerial);
      const sm = state.summary;
      const title = { won: '勝利', lost: '全滅', timeout: '時間切れ' }[r.outcome];
      const unitName = (id) => data.findUnitDef(save.units[id]?.defId ?? id)?.def.name ?? id;

      const lines = [];
      if (r.outcome === 'won') {
        const exp = sm.exp[0]?.amount ?? 0;
        lines.push(h('p', {}, `経験値 ${exp}　${data.find('currencies', data.balance.goldCurrencyId)?.name ?? 'G'} ${sm.gold}`));
        for (const e of sm.exp) {
          if (e.toLevel > e.fromLevel) lines.push(h('p', { class: 'result-up' }, `${unitName(e.unitId)} Lv.${e.fromLevel}→${e.toLevel}`));
          for (const sid of e.learned) lines.push(h('p', { class: 'result-up' }, `${unitName(e.unitId)}は${data.find('skills', sid)?.name}を覚えた`));
        }
        if (sm.drops.length) {
          lines.push(
            h(
              'p',
              { class: 'result-items' },
              sm.drops
                .map((d) => {
                  const item = data.get('items', d.itemId);
                  return `${item.name}${item.hasQuality ? `（${data.qualityName(d.quality)}）` : ''}×${d.qty}`;
                })
                .join('、'),
            ),
          );
        }
        for (const rc of sm.recruits) {
          const name = data.get('monsters', rc.monsterId).name;
          if (!rc.success && rc.boss) {
            lines.push(h('p', { class: 'muted small' }, rc.hint ? `${name}はこちらを見ている……${rc.hint.replace(/^（仮）/, '')}` : `${name}は仲間にならなかった`));
          } else if (!rc.success) {
            lines.push(h('p', { class: 'muted small' }, `${name}は仲間にならなかった（加入率 ${Math.round(rc.chance * 100)}%）`));
          } else if (rc.grant.status === 'added') {
            lines.push(h('p', { class: 'result-recruit' }, `${name}が仲間になった！`));
          } else {
            const conv = rc.grant.converted.map((c) => `${data.get('items', c.itemId).name}×${c.qty}`).join('、');
            lines.push(h('p', { class: 'result-recruit' }, `${name}が仲間になりたがっている。すでにいるので ${conv} に変わった`));
          }
        }
      } else if (r.outcome === 'lost') {
        lines.push(h('p', {}, sm.returnedToTown ? '街まで逃げ帰った。宿屋で休んで立て直そう。' : '全滅してしまった。'));
      } else {
        lines.push(h('p', {}, '決着がつかず、その場を離れた。'));
      }

      const dg = state.dungeon;
      if (dg?.cleared) lines.push(h('p', { class: 'result-recruit' }, 'ダンジョンを踏破した！'));
      const leave = () => {
        if (sm.returnedToTown) ctx.go('town', {}, { reset: true });
        else if (params.source === 'dungeon') ctx.go('dungeon', { dungeonId: params.dungeonId, cleared: dg?.cleared }, { reset: true });
        else if (ctx.canGoBack()) ctx.back();
        else ctx.go('town', {}, { reset: true });
      };
      const isDebug = params.source === 'debug';
      const leaveLabel = isDebug ? '戻る' : sm.returnedToTown ? '街へ' : params.source === 'dungeon' ? (dg?.ended ? '外へ' : '先へ進む') : '探索に戻る';
      const isFieldResult = params.source === 'field' || params.source === 'optionalStrong';
      const report = buildBattleReport(battle);
      const reportTable = h(
        'div',
        { class: 'battle-report-wrap' },
        h('h3', { class: 'battle-report-title' }, '戦績'),
        h(
          'table',
          { class: 'battle-report' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, '仲間'), h('th', { scope: 'col' }, '与ダメ'), h('th', { scope: 'col' }, '被ダメ'), h('th', { scope: 'col' }, '回復'), h('th', { scope: 'col' }, '通常'), h('th', { scope: 'col' }, '特技'))),
          h('tbody', {}, report.map((row) => h('tr', {},
            h('th', { scope: 'row' }, row.name),
            h('td', {}, row.damageDealt),
            h('td', {}, row.damageTaken),
            h('td', {}, row.healing),
            h('td', {}, row.normalAttacks),
            h('td', {}, row.skillUses),
          ))),
        ),
      );
      resultLayer.replaceChildren(
        h(
          'div',
          { class: 'result-panel' },
          h('h2', { class: `result-title result-${r.outcome}` }, title),
          h('p', { class: 'muted small' }, `戦闘時間 ${clock(r.timeMs)}　倒した敵 ${r.defeatedEnemies.length}体`),
          h('div', { class: 'result-lines' }, lines),
          reportTable,
          ctx.debug ? h('p', { class: 'muted small' }, `seed ${r.seed}（同じseedで同じ展開を再現できます）`) : null,
          h('button', { type: 'button', class: 'btn result-log', onClick: (event) => { sheetReturnFocus = event.currentTarget; openLog(); } }, '戦闘ログを見る'),
          h(
            'div',
            { class: `result-actions${isDebug || isFieldResult ? '' : ' single'}` },
            isDebug ? h('button', { type: 'button', class: 'btn', onClick: () => ctx.go('battle', { ...params, seed: undefined }, { replace: true }) }, 'もう一度') : null,
            isFieldResult && !sm.returnedToTown
              ? h('button', { type: 'button', class: 'btn btn-primary', onClick: () => ctx.go('location', {}, { reset: true }) }, '探索を続ける')
              : null,
            isFieldResult && !sm.returnedToTown
              ? h('button', { type: 'button', class: 'btn', disabled: aliveMembers(save, data).length === 0, onClick: () => ctx.go('battle', { ...params, enemies: structuredClone(params.enemies), seed: undefined }, { replace: true }) }, '再戦')
              : null,
            isFieldResult && !sm.returnedToTown
              ? h('button', { type: 'button', class: 'btn', onClick: () => ctx.go('inventory', { tab: 'equipment' }) }, '装備確認')
              : null,
            isFieldResult && !sm.returnedToTown
              ? h('button', { type: 'button', class: 'btn', onClick: () => ctx.go('travel', {}, { reset: true }) }, '冒険先一覧へ')
              : h('button', { type: 'button', class: 'btn btn-primary', onClick: leave }, leaveLabel),
          ),
        ),
      );
      resultLayer.hidden = false;
    }

    // ---- 時間を進める ----
    let raf = 0;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      // 止まっている間も last は毎フレーム更新するので、停止中の実時間は戦闘へ渡らない
      if (pause.isRunning() && !battle.outcome && presentationQueue.length === 0) {
        const budget = dt * speed;
        const t = nextEventTime(battle);
        // 次の出来事が今回の範囲に入るなら、その時刻までだけ進める（同時刻の出来事はまとめて処理される）
        if (t != null && t <= battle.timeMs + budget) advance(battle, data, t - battle.timeMs);
        else advance(battle, data, budget);
      }
      if (battle.outcome && !pause.isOver()) {
        pause.setManual(false);
        pause.markOver();
      }
      paint(now);
      if (!battle.outcome || presentationQueue.length || resultLayer.hidden) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    ctx.onCleanup(() => cancelAnimationFrame(raf));
    ctx.onCleanup(() => {
      for (const timer of fxTimers) clearTimeout(timer);
      fxTimers.clear();
      audio.dispose();
    });

    paint();
    return root;
  },
};
