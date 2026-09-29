/**
 * 戦闘画面。
 *
 * params:
 *   enemies : [{ defId, level }]  敵
 *   mode    : 'field' | 'dungeon'
 *   seed    : 省略時はランダム（同じseedなら同じ展開になる）
 *   source  : 'field'（探索中の戦闘。HP・報酬を反映）/ 'dungeon'（連戦。MPも持ち越し）/ 'debug'（報酬のみ反映、HPは変えない）
 *
 * 描画の仕組み: DOMは最初に1回だけ作り、毎フレーム paint() で数値とバーだけ更新する。
 * エンジン（src/battle/engine.js）は「進めた時間」だけで結果が決まるため、
 * 速度ボタンは実時間に掛ける倍率を変えているだけで、戦闘結果には影響しない。
 */
import { h } from '../dom.js';
import { unitImageSrc } from '../placeholder.js';
import { describeEvent } from '../battleLog.js';
import { buildBattleReport, effectPresentation, presentationCues, presentationDelayMs } from '../battlePresentation.js';
import { createBattleAudio, shouldPlayCue } from '../battleAudio.js';
import { createBattle, advance, battleResult, sideOf, effectiveInterval } from '../../battle/engine.js';
import { alliesFromParty } from '../../battle/setup.js';
import { markMonster } from '../../progression/codex.js';
import { applyBattleOutcome } from '../../game/battleOutcome.js';
import { afterDungeonBattle, dungeonMp } from '../../exploration/dungeon.js';
import { aliveMembers } from '../../progression/hp.js';

const LOG_LINES = 4;
const FLASH_MS = 900;
const MAX_FRAME_MS = 250;
const MAX_FX_NODES = 24;

function bar(kind) {
  const fill = h('span', { class: 'bar-fill' });
  return { el: h('span', { class: `bar bar-${kind}` }, fill), fill };
}

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
      state.paused = false;
      for (const e of params.enemies) markMonster(save, e.defId, 'encountered');
      session.commit();
    }
    const battle = state.battle;
    const storedSpeed = Number(save.settings?.battleSpeed);
    let speed = speeds.includes(storedSpeed)
      ? storedSpeed
      : (speeds.filter((candidate) => candidate <= storedSpeed).at(-1) ?? speeds[0]);
    let soundEnabled = save.settings?.battleSoundEnabled !== false;
    let soundVolume = Number.isFinite(save.settings?.battleSoundVolume) ? Math.max(0, Math.min(1, save.settings.battleSoundVolume)) : 0.45;

    // ---- 部品を作る ----
    const cards = new Map();
    const statusChips = (u) => [
      ...u.statuses.map((s) => {
        const name = data.find('statuses', s.statusId)?.name.replace(/^（仮）/, '') ?? s.statusId;
        const remaining = s.remainingTurns != null ? `${s.remainingTurns}T` : s.expiresAt != null ? `${Math.max(0, Math.ceil((s.expiresAt - battle.timeMs) / 1000))}秒` : '';
        return h('span', { class: 'status-chip status-effect' }, `${name}${remaining ? ` ${remaining}` : ''}`);
      }),
      ...Object.entries(u.markers ?? {})
        .filter(([markerId, state]) => {
          const marker = data.find('markers', markerId);
          const allowed = !marker?.allowedSpeciesIds?.length || marker.allowedSpeciesIds.some((speciesId) => u.speciesIds?.includes(speciesId));
          return state.stacks > 0 && allowed;
        })
        .map(([markerId, state]) => {
          const marker = data.find('markers', markerId);
          const value = marker?.showMax ? `${state.stacks}/${marker.maxStacks}` : state.stacks;
          return h('span', { class: 'status-chip' }, `${marker?.name ?? markerId} ${value}`);
        }),
    ];

    const enemyCard = (u) => {
      const hp = bar('hp');
      const brk = u.boss?.break ? bar('break') : null;
      const status = h('span', { class: 'status-row' });
      const count = h('span', { class: 'attack-count enemy-count' });
      const alert = h('span', { class: 'boss-alert', 'aria-live': 'polite' });
      const el = h(
        'div',
        { class: `enemy-card${u.boss ? ' is-boss' : ''}${u.isPart ? ' is-part' : ''}` },
        h('img', { class: `portrait ${u.isPart ? 'portrait-sm' : 'portrait-md'}`, src: unitImageSrc({ id: u.isPart ? `${u.defId}_${u.partKey}` : u.defId, name: u.name, image: u.image }, 'monster'), alt: '' }),
        u.isPart ? h('span', { class: 'part-label' }, '部位') : null,
        h('span', { class: 'enemy-name' }, u.name),
        count,
        hp.el,
        brk ? h('span', { class: 'break-row' }, h('span', { class: 'meter-label' }, 'BRK'), brk.el) : null,
        alert,
        status,
      );
      cards.set(u.id, { el, hp, brk, alert, status, count });
      return el;
    };

    const allyCard = (u) => {
      const hp = bar('hp');
      const mp = bar('mp');
      const next = bar('next');
      const hpText = h('span', { class: 'num' });
      const mpText = h('span', { class: 'num' });
      const count = h('span', { class: 'attack-count' });
      const flash = h('span', { class: 'skill-flash', 'aria-live': 'polite' });
      const status = h('span', { class: 'status-row' });
      const el = h(
        'div',
        { class: 'ally-card' },
        h(
          'div',
          { class: 'ally-head' },
          h('img', { class: 'portrait portrait-md', src: unitImageSrc({ id: u.defId, name: u.name, image: u.image }, u.kind), alt: '' }),
          h('span', { class: 'ally-name' }, u.name),
        ),
        h('div', { class: 'meter' }, h('span', { class: 'meter-label' }, 'HP'), hp.el, hpText),
        h('div', { class: 'meter' }, h('span', { class: 'meter-label' }, 'MP'), mp.el, mpText),
        h('div', { class: 'meter' }, count, next.el),
        flash,
        status,
      );
      cards.set(u.id, { el, hp, mp, next, hpText, mpText, count, flash, status });
      return el;
    };

    const timeText = h('span', { class: 'battle-time' });
    const speedButtons = speeds.map((s) =>
      h(
        'button',
        {
          type: 'button',
          class: 'speed-btn',
          'aria-pressed': 'false',
          onClick: () => {
            speed = s;
            save.settings = { ...(save.settings ?? {}), battleSpeed: s };
            session.commit();
            paint();
          },
        },
        `×${s}`,
      ),
    );
    const pauseBtn = h(
      'button',
      {
        type: 'button',
        class: 'speed-btn pause-btn',
        onClick: () => {
          state.paused = !state.paused;
          paint();
        },
      },
      '一時停止',
    );
    const soundButton = h('button', {
      type: 'button',
      class: 'sound-toggle',
      'aria-pressed': String(soundEnabled),
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
    const logList = h('ol', { class: 'battle-log', 'aria-label': '戦闘ログ' });
    const resultLayer = h('div', { class: 'battle-result', hidden: true });

    const root = h(
      'section',
      { class: 'battle-screen', onPointerdown: () => audio.resume() },
      h('div', { class: 'battle-bar' }, timeText, h('span', { class: 'speed-group', role: 'group', 'aria-label': '戦闘速度' }, speedButtons, pauseBtn)),
      h('div', { class: 'battle-audio-bar' }, h('span', { class: 'sound-label' }, '効果音'), soundButton, volumeInput, volumeText),
      h('div', { class: 'battle-stage', 'aria-label': '戦場' },
        h('div', { class: 'skill-banner', 'aria-live': 'polite', 'aria-atomic': 'true' }),
        h('div', { class: `enemy-row units-${sideOf(battle, 'enemy').length}` }, sideOf(battle, 'enemy').map(enemyCard)),
        h('div', { class: `ally-grid units-${sideOf(battle, 'ally').length}` }, sideOf(battle, 'ally').map(allyCard)),
      ),
      logList,
      resultLayer,
    );

    const banner = root.querySelector('.skill-banner');
    const fxTimers = new Set();
    const presentationQueue = [];
    let processedLog = battle.log.length;
    let nextPresentationAt = 0;
    let cueSerial = 0;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const audio = createBattleAudio({ enabled: () => soundEnabled, volume: () => soundVolume });
    audio.resume();

    function updateSoundControls() {
      soundButton.textContent = soundEnabled ? '🔊 ON' : '🔇 OFF';
      soundButton.setAttribute('aria-pressed', String(soundEnabled));
      volumeInput.disabled = !soundEnabled;
      volumeText.textContent = `${Math.round(soundVolume * 100)}%`;
    }
    updateSoundControls();

    function later(fn, ms) {
      const timer = setTimeout(() => {
        fxTimers.delete(timer);
        fn();
      }, ms);
      fxTimers.add(timer);
    }

    function pulse(el, className, ms = 520) {
      if (!el || reducedMotion) return;
      el.classList.remove(className);
      void el.offsetWidth;
      el.classList.add(className);
      later(() => el.classList.remove(className), ms);
    }

    function floatText(card, text, kind) {
      if (!card) return;
      while (root.querySelectorAll('.battle-float').length >= MAX_FX_NODES) root.querySelector('.battle-float')?.remove();
      const node = h('span', { class: `battle-float float-${kind}`, 'aria-hidden': 'true' }, text);
      card.el.append(node);
      node.addEventListener('animationend', () => node.remove(), { once: true });
      later(() => node.remove(), 1100);
    }

    function spawnParticles(card, cue, serial) {
      if (!card || reducedMotion || !shouldPlayCue(cue, speed, serial)) return;
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
      card.el.append(burst);
      burst.addEventListener('animationend', (event) => {
        if (event.target === burst) burst.remove();
      });
      later(() => burst.remove(), 1100);
    }

    function showBanner(cue) {
      if (!cue.label) return;
      banner.textContent = cue.label;
      banner.className = `skill-banner show tier-${cue.tier}`;
      pulse(banner, 'banner-pop', cue.tier === 'ultimate' ? 1000 : 700);
      later(() => {
        if (banner.textContent === cue.label) banner.className = 'skill-banner';
      }, cue.tier === 'ultimate' ? 1200 : 850);
    }

    function renderCue(cue) {
      cueSerial += 1;
      audio.play(cue, data, speed, cueSerial);
      const card = cards.get(cue.targetId);
      if (cue.type === 'action') {
        pulse(card?.el, `motion-${cue.tier}`, cue.tier === 'ultimate' ? 900 : 520);
        if (cue.countsAsAttack && cue.tier !== 'normal') pulse(card?.count, 'count-trigger', 700);
      } else if (cue.type === 'banner') showBanner(cue);
      else if (cue.type === 'damage') {
        floatText(card, cue.amount, cue.dot ? 'dot' : 'damage');
        pulse(card?.el, 'motion-hit', 380);
        spawnParticles(card, cue, cueSerial);
      } else if (cue.type === 'heal') {
        floatText(card, `+${cue.amount}`, 'heal');
        pulse(card?.el, 'motion-heal', 650);
        spawnParticles(card, cue, cueSerial);
      } else if (cue.type === 'miss') {
        floatText(card, 'MISS', 'miss');
        pulse(card?.el, 'motion-dodge', 500);
      } else if (cue.type === 'marker') {
        const name = data.find('markers', cue.markerId)?.name ?? cue.markerId;
        floatText(card, `${name} ${cue.amount > 0 ? '+' : ''}${cue.amount}`, 'marker');
        spawnParticles(card, cue, cueSerial);
      } else if (cue.type === 'status') {
        const name = data.find('statuses', cue.statusId)?.name?.replace(/^（仮）/, '') ?? cue.statusId;
        floatText(card, name, 'status');
        spawnParticles(card, cue, cueSerial);
      } else if (cue.type === 'attackCount') {
        floatText(card, `攻撃回数 +${cue.amount}`, 'count');
        pulse(card?.count, 'count-trigger', 700);
      } else if (cue.type === 'comboQueued') {
        floatText(card, '連携準備', 'combo');
      } else if (cue.type === 'combo') {
        const name = data.find('skills', cue.skillId)?.name ?? '連携発動';
        showBanner({ label: name, tier: 'combo' });
        pulse(card?.el, 'motion-combo', 750);
      } else if (cue.type === 'break') {
        floatText(card, 'BREAK!', 'break');
        spawnParticles(card, cue, cueSerial);
      } else if (cue.type === 'defeat') pulse(card?.el, 'motion-ko', 700);
    }

    function presentNewEvents(now = performance.now()) {
      const events = battle.log.slice(processedLog);
      processedLog = battle.log.length;
      for (const event of events) {
        const cues = presentationCues(event, battle, data);
        if (cues.length) presentationQueue.push(cues);
      }
      if (!presentationQueue.length || now < nextPresentationAt) return;
      const cues = presentationQueue.shift();
      for (const cue of cues) renderCue(cue);
      nextPresentationAt = now + presentationDelayMs(speed, cues);
    }

    // ---- 描画 ----
    let shownLog = -1;
    function paint(now = performance.now()) {
      timeText.textContent = `経過 ${clock(battle.timeMs)}`;
      speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(speeds[i] === speed)));
      pauseBtn.textContent = state.paused ? '再開' : '一時停止';

      for (const u of battle.units) {
        const c = cards.get(u.id);
        c.el.classList.toggle('down', !u.alive);
        c.hp.fill.style.width = `${(u.hp / u.maxHp) * 100}%`;
        c.status.replaceChildren(...statusChips(u));
        if (u.side !== 'ally') {
          c.count.textContent = `HP ${u.hp}/${u.maxHp}・攻${u.attackCount}`;
          if (c.brk) c.brk.fill.style.width = `${u.broken ? 0 : (u.boss.break.gauge / u.boss.break.max) * 100}%`;
          if (c.alert) {
            c.alert.textContent = u.broken ? 'BREAK!' : u.charging ? '力をためている！' : '';
            c.el.classList.toggle('charging', Boolean(u.charging));
            c.el.classList.toggle('broken', Boolean(u.broken));
          }
          continue;
        }
        c.hpText.textContent = `${u.hp}/${u.maxHp}`;
        c.mp.fill.style.width = u.maxMp ? `${(u.mp / u.maxMp) * 100}%` : '0%';
        c.mpText.textContent = `${u.mp}/${u.maxMp}`;
        c.count.textContent = `攻撃 ${u.attackCount}回`;
        const interval = effectiveInterval(u);
        const progress = u.alive ? 1 - Math.max(0, u.nextAttackAt - battle.timeMs) / interval : 0;
        c.next.fill.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
        const la = u.lastAction;
        const flashing = la && la.kind === 'skill' && battle.timeMs - la.t < FLASH_MS;
        c.flash.textContent = flashing ? data.find('skills', la.skillId)?.name ?? '' : '';
        c.el.classList.toggle('acting', Boolean(flashing));
      }

      presentNewEvents(now);

      if (battle.log.length !== shownLog) {
        shownLog = battle.log.length;
        const lines = [];
        for (let i = battle.log.length - 1; i >= 0 && lines.length < LOG_LINES; i--) {
          const text = describeEvent(battle.log[i], battle, data);
          if (text) lines.push(h('li', {}, text));
        }
        logList.replaceChildren(...lines);
      }

      if (battle.outcome && !presentationQueue.length && now >= nextPresentationAt) showResult();
    }

    function showResult() {
      if (!state.summary) {
        state.summary = applyBattleOutcome(save, data, battle, session.rng, { applyHp: params.source !== 'debug' });
        if (params.source === 'dungeon') state.dungeon = afterDungeonBattle(save, data, battle);
        session.commit();
      }
      if (!resultLayer.hidden) return;
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
              ? h('button', { type: 'button', class: 'btn', onClick: () => ctx.go('travel', {}, { reset: true }) }, '戻る')
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
      if (!state.paused && !battle.outcome && presentationQueue.length === 0) advance(battle, data, dt * speed);
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
