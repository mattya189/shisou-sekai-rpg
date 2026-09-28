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
 * 速度 ×1/×2/×3 は実時間に掛ける倍率を変えているだけ。
 */
import { h } from '../dom.js';
import { unitImageSrc } from '../placeholder.js';
import { describeEvent } from '../battleLog.js';
import { createBattle, advance, battleResult, sideOf, effectiveInterval } from '../../battle/engine.js';
import { alliesFromParty } from '../../battle/setup.js';
import { markMonster } from '../../progression/codex.js';
import { applyBattleOutcome } from '../../game/battleOutcome.js';
import { afterDungeonBattle, dungeonMp } from '../../exploration/dungeon.js';

const LOG_LINES = 6;
const FLASH_MS = 900;
const MAX_FRAME_MS = 250;

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
    let speed = speeds.includes(save.settings?.battleSpeed) ? save.settings.battleSpeed : speeds[0];

    // ---- 部品を作る ----
    const cards = new Map();
    const statusChips = (u) => [
      ...u.statuses.map((s) => h('span', { class: 'status-chip' }, data.find('statuses', s.statusId)?.name.replace(/^（仮）/, '') ?? s.statusId)),
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
      const alert = h('span', { class: 'boss-alert', 'aria-live': 'polite' });
      const el = h(
        'div',
        { class: `enemy-card${u.boss ? ' is-boss' : ''}${u.isPart ? ' is-part' : ''}` },
        h('img', { class: `portrait ${u.isPart ? 'portrait-sm' : 'portrait-md'}`, src: unitImageSrc({ id: u.isPart ? `${u.defId}_${u.partKey}` : u.defId, name: u.name, image: u.image }, 'monster'), alt: '' }),
        u.isPart ? h('span', { class: 'part-label' }, '部位') : null,
        h('span', { class: 'enemy-name' }, u.name),
        hp.el,
        brk ? h('span', { class: 'break-row' }, h('span', { class: 'meter-label' }, 'BRK'), brk.el) : null,
        alert,
        status,
      );
      cards.set(u.id, { el, hp, brk, alert, status });
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
          h('img', { class: 'portrait portrait-sm', src: unitImageSrc({ id: u.defId, name: u.name, image: u.image }, u.kind), alt: '' }),
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
    const logList = h('ol', { class: 'battle-log', 'aria-label': '戦闘ログ' });
    const resultLayer = h('div', { class: 'battle-result', hidden: true });

    const root = h(
      'section',
      { class: 'battle-screen' },
      h('div', { class: 'battle-bar' }, timeText, h('span', { class: 'speed-group', role: 'group', 'aria-label': '戦闘速度' }, speedButtons, pauseBtn)),
      h('div', { class: 'enemy-row' }, sideOf(battle, 'enemy').map(enemyCard)),
      logList,
      h('div', { class: 'ally-grid' }, sideOf(battle, 'ally').map(allyCard)),
      resultLayer,
    );

    // ---- 描画 ----
    let shownLog = -1;
    function paint() {
      timeText.textContent = `経過 ${clock(battle.timeMs)}`;
      speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(speeds[i] === speed)));
      pauseBtn.textContent = state.paused ? '再開' : '一時停止';

      for (const u of battle.units) {
        const c = cards.get(u.id);
        c.el.classList.toggle('down', !u.alive);
        c.hp.fill.style.width = `${(u.hp / u.maxHp) * 100}%`;
        c.status.replaceChildren(...statusChips(u));
        if (u.side !== 'ally') {
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

      if (battle.log.length !== shownLog) {
        shownLog = battle.log.length;
        const lines = [];
        for (let i = battle.log.length - 1; i >= 0 && lines.length < LOG_LINES; i--) {
          const text = describeEvent(battle.log[i], battle, data);
          if (text) lines.push(h('li', {}, text));
        }
        logList.replaceChildren(...lines);
      }

      if (battle.outcome) showResult();
    }

    function showResult() {
      if (!state.summary) {
        state.summary = applyBattleOutcome(save, data, battle, session.rng, { applyHp: params.source !== 'debug' });
        if (params.source === 'dungeon') state.dungeon = afterDungeonBattle(save, data, battle);
        session.commit();
      }
      if (!resultLayer.hidden) return;
      const r = battleResult(battle);
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
      resultLayer.replaceChildren(
        h(
          'div',
          { class: 'result-panel' },
          h('h2', { class: `result-title result-${r.outcome}` }, title),
          h('p', { class: 'muted small' }, `戦闘時間 ${clock(r.timeMs)}　倒した敵 ${r.defeatedEnemies.length}体`),
          h('div', { class: 'result-lines' }, lines),
          ctx.debug ? h('p', { class: 'muted small' }, `seed ${r.seed}（同じseedで同じ展開を再現できます）`) : null,
          h(
            'div',
            { class: `result-actions${isDebug ? '' : ' single'}` },
            isDebug ? h('button', { type: 'button', class: 'btn', onClick: () => ctx.go('battle', { ...params, seed: undefined }, { replace: true }) }, 'もう一度') : null,
            h('button', { type: 'button', class: 'btn btn-primary', onClick: leave }, leaveLabel),
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
      if (!state.paused && !battle.outcome) advance(battle, data, dt * speed);
      paint();
      if (!battle.outcome) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    ctx.onCleanup(() => cancelAnimationFrame(raf));

    paint();
    return root;
  },
};
