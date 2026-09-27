/**
 * 攻撃回数型リアルタイム自動戦闘エンジン。DOMに依存しない。
 *
 * 使い方:
 *   const battle = createBattle(data, { allies, enemies, seed, mode });
 *   advance(battle, data, 16);      // 経過時間（ミリ秒）ぶん進める。画面は毎フレーム呼ぶ
 *   runToEnd(battle, data);         // 決着まで一気に進める（テスト・将来の自動周回用）
 *   battleResult(battle);           // 結果
 *
 * 時間の扱い:
 *   各ユニットの攻撃・状態異常の継続ダメージ・効果切れを「発生時刻つきの出来事」として、
 *   時刻の早い順に1つずつ処理する。advance に渡す時間の刻み方に結果は左右されない。
 *   そのため ×1 / ×2 / ×3 の速度変更は「実時間あたりに進める量」を変えるだけで、結果は同じになる。
 *
 * 同時刻の出来事の順番: 継続ダメージ → 効果切れ → 攻撃。同じ種類なら味方（並び順）→ 敵（並び順）。
 *
 * 乱数: battle.rng だけを使う。seed が同じなら結果は完全に同じ。
 */
import { createRng } from '../core/rng.js';
import { createCombatant, createBossUnits, addBuffs, effectiveInterval, effectiveStat } from './combatant.js';
import { checkCondition } from './conditions.js';
import { EFFECTS } from './effects.js';
import { PASSIVE_EFFECTS } from './passives.js';
import { STATUS_KINDS } from './statusEffects.js';
import { computeDamage } from './damage.js';
import { hpPct } from './unitState.js';

const SUFFIX = 'ABCDEFGHIJ';

/**
 * @param {import('../core/gameData.js').GameData} data
 * @param {{ allies: any[], enemies: any[], seed?: number, mode?: 'field' | 'dungeon' }} opts
 *   allies / enemies は createCombatant の spec（src/battle/combatant.js）
 *   敵に { bossId, level? } を渡すとボス（bosses.json）になる。部位があれば部位も敵として並ぶ
 *   mode: 'field' は戦闘後にMP全回復、'dungeon' はHP/MPを持ち越す
 */
export function createBattle(data, { allies, enemies, seed = 1, mode = 'field' }) {
  if (!allies?.length) throw new Error('味方が1体以上必要です');
  if (!enemies?.length) throw new Error('敵が1体以上必要です');
  const enemyUnits = enemies.flatMap((s) => (s.bossId ? createBossUnits(data, s) : [createCombatant(data, s, { id: '', side: 'enemy' })]));
  enemyUnits.forEach((u, i) => {
    u.id = `e${i + 1}`;
  });
  const units = [...allies.map((s, i) => createCombatant(data, s, { id: `a${i + 1}`, side: 'ally' })), ...enemyUnits];
  // 同じ敵が複数いるときは「A」「B」を付けて区別する
  const counts = {};
  for (const u of units) if (u.side === 'enemy' && !u.isPart) counts[u.defId] = (counts[u.defId] ?? 0) + 1;
  const seen = {};
  for (const u of units) {
    if (u.side === 'enemy' && !u.isPart && counts[u.defId] > 1) {
      u.name = `${u.name} ${SUFFIX[seen[u.defId] ?? 0]}`;
      seen[u.defId] = (seen[u.defId] ?? 0) + 1;
    }
  }
  return {
    seed,
    rng: createRng(seed),
    mode,
    timeMs: 0,
    /** null: 戦闘中 / 'won' / 'lost' / 'timeout' */
    outcome: null,
    units,
    log: [{ t: 0, type: 'start' }],
  };
}

export function sideOf(battle, side) {
  return battle.units.filter((u) => u.side === side);
}

export function aliveOf(battle, side) {
  return battle.units.filter((u) => u.side === side && u.alive);
}

/**
 * 戦闘を dtMs ミリ秒進める。
 * @returns {number} 今回追加されたログの件数
 */
export function advance(battle, data, dtMs) {
  if (battle.outcome) return 0;
  const before = battle.log.length;
  const limit = data.balance.battle.timeLimitMs;
  const target = Math.min(battle.timeMs + Math.max(0, dtMs), limit);

  while (!battle.outcome) {
    const ev = nextEvent(battle);
    if (!ev || ev.time > target) break;
    battle.timeMs = ev.time;
    processEvent(battle, data, ev);
    checkOutcome(battle);
  }
  if (!battle.outcome) {
    battle.timeMs = target;
    if (target >= limit) finish(battle, 'timeout');
  }
  return battle.log.length - before;
}

/** 決着まで進める */
export function runToEnd(battle, data) {
  advance(battle, data, data.balance.battle.timeLimitMs);
  return battle;
}

/**
 * 戦闘結果。フィールド戦闘ではMPを全回復した値を返す。
 */
export function battleResult(battle) {
  return {
    outcome: battle.outcome,
    timeMs: battle.timeMs,
    seed: battle.seed,
    mode: battle.mode,
    allies: sideOf(battle, 'ally').map((u) => ({
      id: u.id,
      unitId: u.unitId,
      defId: u.defId,
      alive: u.alive,
      hp: u.hp,
      maxHp: u.maxHp,
      mp: battle.mode === 'field' ? u.maxMp : u.mp,
      maxMp: u.maxMp,
    })),
    defeatedEnemies: sideOf(battle, 'enemy')
      .filter((u) => !u.alive && !u.isPart)
      .map((u) => u.defId),
    bosses: sideOf(battle, 'enemy')
      .filter((u) => u.boss)
      .map((u) => ({
        bossId: u.boss.id,
        defeated: !u.alive,
        level: u.level,
        breakCount: u.boss.break?.count ?? 0,
        partsDestroyed: u.boss.partsDestroyed,
      })),
  };
}

// ---------------------------------------------------------------------------

function nextEvent(battle) {
  let best = null;
  battle.units.forEach((unit, order) => {
    if (!unit.alive) return;
    const consider = (time, prio, kind, status) => {
      if (
        !best ||
        time < best.time ||
        (time === best.time && (prio < best.prio || (prio === best.prio && order < best.order)))
      ) {
        best = { time, prio, order, kind, unit, status };
      }
    };
    for (const s of unit.statuses) {
      if (s.nextTickAt != null && s.nextTickAt <= s.expiresAt) consider(s.nextTickAt, 0, 'tick', s);
      consider(s.expiresAt, 1, 'expire', s);
    }
    if (unit.boss) {
      if (unit.boss.break?.endsAt != null) consider(unit.boss.break.endsAt, 1, 'breakEnd');
      for (const g of unit.boss.gimmicks) if (!g.done) consider(g.atMs, 1, 'gimmick', g);
    }
    consider(unit.nextAttackAt, 2, 'act');
  });
  return best;
}

function processEvent(battle, data, ev) {
  if (ev.kind === 'act') act(battle, data, ev.unit);
  else if (ev.kind === 'tick') statusTick(battle, ev.unit, ev.status);
  else if (ev.kind === 'expire') statusExpire(battle, ev.unit, ev.status);
  else if (ev.kind === 'breakEnd') breakEnd(battle, ev.unit);
  else if (ev.kind === 'gimmick') gimmick(battle, ev.unit, ev.status);
}

function breakEnd(battle, unit) {
  const bb = unit.boss.break;
  unit.broken = false;
  bb.endsAt = null;
  bb.gauge = bb.max;
  battle.log.push({ t: battle.timeMs, type: 'breakEnd', targetId: unit.id });
}

function gimmick(battle, unit, g) {
  g.done = true;
  addBuffs(unit, g.statPct);
  battle.log.push({ t: battle.timeMs, type: 'gimmick', targetId: unit.id, message: g.message ?? null });
}

function checkOutcome(battle) {
  if (battle.outcome) return;
  // 部位は倒さなくてもよい（本体を倒せば勝ち）
  if (aliveOf(battle, 'enemy').filter((u) => !u.isPart).length === 0) finish(battle, 'won');
  else if (aliveOf(battle, 'ally').length === 0) finish(battle, 'lost');
}

function finish(battle, outcome) {
  battle.outcome = outcome;
  battle.log.push({ t: battle.timeMs, type: 'end', outcome });
}

function makeApi(battle, data) {
  const t = () => battle.timeMs;
  const api = {
    targets(type, act) {
      const allies = aliveOf(battle, act.actor.side);
      const foes = aliveOf(battle, act.actor.side === 'ally' ? 'enemy' : 'ally');
      switch (type) {
        case 'enemySingle':
          return act.primaryTarget?.alive ? [act.primaryTarget] : foes.slice(0, 1);
        case 'enemyAll':
          return foes;
        case 'self':
          return act.actor.alive ? [act.actor] : [];
        case 'allyLowestHp': {
          let best = null;
          for (const a of allies) if (!best || hpPct(a) < hpPct(best)) best = a;
          return best ? [best] : [];
        }
        case 'allyAll':
          return allies;
        default:
          return [];
      }
    },
    dealDamage(attacker, target, power, element, results, breakPower = 1) {
      const amount = computeDamage({ attacker, target, power, element, rng: battle.rng, balance: data.balance });
      applyDamage(battle, target, amount, results, { element });
      if (target.alive && target.boss) {
        reduceBreak(battle, target, breakPower, results);
        checkPhase(target, results);
      }
    },
    heal(target, amount, source, results) {
      if (!target.alive) return;
      const actual = Math.min(target.maxHp - target.hp, amount);
      target.hp += actual;
      results?.push({ kind: 'heal', targetId: target.id, amount: actual, source });
    },
    applyStatus(target, statusId, chance, results) {
      if (!target.alive) return;
      const def = data.get('statuses', statusId);
      if (target.statusImmune.includes(statusId)) {
        results.push({ kind: 'statusResisted', targetId: target.id, statusId, immune: true });
        return;
      }
      if (chance < 1 && !battle.rng.chance(chance)) {
        results.push({ kind: 'statusResisted', targetId: target.id, statusId });
        return;
      }
      const existing = target.statuses.find((s) => s.statusId === statusId);
      if (existing) {
        existing.expiresAt = t() + def.durationMs;
        results.push({ kind: 'statusRefreshed', targetId: target.id, statusId });
        return;
      }
      const inst = { statusId, kind: def.kind, params: { ...def.params }, expiresAt: t() + def.durationMs, nextTickAt: null };
      target.statuses.push(inst);
      STATUS_KINDS[def.kind]?.onApply?.(inst, target, t());
      results.push({ kind: 'statusApplied', targetId: target.id, statusId });
    },
  };
  return api;
}

function applyDamage(battle, target, amount, results, extra = {}) {
  const actual = Math.min(target.hp, amount);
  target.hp -= actual;
  results.push({ kind: 'damage', targetId: target.id, amount: actual, ...extra });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.statuses = [];
    target.charging = false;
    results.push({ kind: 'defeat', targetId: target.id });
    if (target.isPart) destroyPart(target, results);
  }
}

/** 部位破壊: 本体に onDestroy の効果（特技の封印・能力増減）をかける */
function destroyPart(part, results) {
  const boss = part.partOfUnit;
  if (!boss?.alive) return;
  boss.boss.partsDestroyed += 1;
  const od = part.onDestroy ?? {};
  for (const sid of od.removeSkills ?? []) {
    boss.boss.removedSkills.push(sid);
    boss.skills = boss.skills.filter((id) => id !== sid);
  }
  addBuffs(boss, od.statPct);
  results.push({ kind: 'partBroken', targetId: part.id, bossId: boss.id, message: od.message ?? null });
}

/** BREAKゲージを削る。0になったらBREAK（行動不能・被ダメージ増加、大技の準備は中断） */
function reduceBreak(battle, target, amount, results) {
  const bb = target.boss.break;
  if (!bb || target.broken) return;
  bb.gauge = Math.max(0, bb.gauge - amount);
  if (bb.gauge > 0) return;
  target.broken = true;
  bb.count += 1;
  bb.endsAt = battle.timeMs + bb.durationMs;
  if (target.charging) {
    target.charging = false;
    results.push({ kind: 'chargeCanceled', targetId: target.id });
  }
  target.nextAttackAt = Math.max(target.nextAttackAt, bb.endsAt);
  results.push({ kind: 'break', targetId: target.id });
}

/** HPが減ったらフェーズを進める（特技の入れ替え・能力アップ） */
function checkPhase(target, results) {
  const b = target.boss;
  for (let i = b.phaseIndex + 1; i < b.phases.length; i++) {
    const ph = b.phases[i];
    if (hpPct(target) > ph.hpBelowPct) break;
    b.phaseIndex = i;
    if (ph.skills) target.skills = ph.skills.filter((id) => !b.removedSkills.includes(id));
    addBuffs(target, ph.statPct);
    results.push({ kind: 'phase', targetId: target.id, message: ph.message ?? null });
  }
}

/** 1回の攻撃（攻撃回数+1 → 特技判定 → 特技 or 通常攻撃） */
function act(battle, data, actor) {
  const api = makeApi(battle, data);
  actor.attackCount += 1;
  for (const p of actor.passives) PASSIVE_EFFECTS[p.effect.type]?.onActionStart?.(p.effect, actor, p.key);

  const allies = aliveOf(battle, actor.side);
  const foes = aliveOf(battle, actor.side === 'ally' ? 'enemy' : 'ally');
  // 主な攻撃対象: 味方は先頭の敵を集中攻撃、敵は味方をランダムに狙う
  const primaryTarget = actor.side === 'ally' ? foes[0] : battle.rng.pick(foes);
  const condCtx = { self: actor, allies, enemies: foes, target: primaryTarget, attackCount: actor.attackCount };

  // ボスの大技: 決まった回数ごとに力をため（予兆）、ため終わったら必ず放つ
  let forced = null;
  const charge = actor.boss?.charge;
  if (charge && !actor.boss.removedSkills.includes(charge.skillId)) {
    if (actor.charging) {
      actor.charging = false;
      forced = data.get('skills', charge.skillId);
    } else if (actor.attackCount % charge.everyNAttacks === 0) {
      actor.charging = true;
      actor.nextAttackAt = battle.timeMs + charge.chargeMs;
      actor.lastAction = { t: battle.timeMs, kind: 'charge', skillId: charge.skillId };
      battle.log.push({ t: battle.timeMs, type: 'chargeStart', actorId: actor.id, skillId: charge.skillId, message: charge.message ?? null });
      return;
    }
  }

  let used = forced;
  const skippedForMp = [];
  for (const skillId of forced ? [] : actor.skills) {
    const skill = data.find('skills', skillId);
    if (!skill) continue;
    if (!checkCondition(skill.trigger, condCtx)) continue;
    if (actor.usesMp && actor.mp < skill.mpCost) {
      skippedForMp.push(skillId);
      continue;
    }
    used = skill;
    break;
  }

  const results = [];
  const event = {
    t: battle.timeMs,
    type: 'action',
    actorId: actor.id,
    attackCount: actor.attackCount,
    kind: used ? 'skill' : 'normal',
    skillId: used?.id ?? null,
    skippedForMp,
    charged: Boolean(forced),
    results,
  };
  const actCtx = { actor, primaryTarget, skill: used, results };

  if (used) {
    if (actor.usesMp && !forced) actor.mp -= used.mpCost;
    for (const effect of used.effects) EFFECTS[effect.type]?.apply(effect, api, actCtx);
  } else if (primaryTarget) {
    api.dealDamage(actor, primaryTarget, data.balance.normalAttack.power, null, results, 1);
    if (actor.usesMp && actor.maxMp > 0) {
      let pct = data.balance.normalAttack.mpRecoverPctOfMax;
      for (const p of actor.passives) pct += PASSIVE_EFFECTS[p.effect.type]?.normalAttackMpPct?.(p.effect) ?? 0;
      const amount = Math.max(1, Math.floor((actor.maxMp * pct) / 100));
      const actual = Math.min(actor.maxMp - actor.mp, amount);
      actor.mp += actual;
      results.push({ kind: 'mpRecover', targetId: actor.id, amount: actual });
    }
  }

  if (actor.alive) {
    const passiveApi = { heal: (target, amount, source) => api.heal(target, amount, source, results) };
    for (const p of actor.passives) PASSIVE_EFFECTS[p.effect.type]?.afterAction?.(p.effect, actor, p.key, passiveApi);
  }

  actor.lastAction = { t: battle.timeMs, kind: event.kind, skillId: event.skillId };
  battle.log.push(event);
  actor.nextAttackAt += effectiveInterval(actor);
}

function statusTick(battle, unit, status) {
  const kind = STATUS_KINDS[status.kind];
  const results = [];
  applyDamage(battle, unit, kind.tickDamage(status, unit), results);
  battle.log.push({ t: battle.timeMs, type: 'statusTick', targetId: unit.id, statusId: status.statusId, results });
  status.nextTickAt += status.params.tickMs;
}

function statusExpire(battle, unit, status) {
  unit.statuses = unit.statuses.filter((s) => s !== status);
  battle.log.push({ t: battle.timeMs, type: 'statusEnd', targetId: unit.id, statusId: status.statusId });
}

// テストや画面から使う補助
export { effectiveStat, effectiveInterval };
