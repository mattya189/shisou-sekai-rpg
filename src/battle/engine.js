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
 * ターンは「そのユニットが1回行動すること」。turnCount は全行動、attackCount は攻撃成立時だけ増える。
 * 同時刻の出来事の順番: 時間基準の継続ダメージ → 効果切れ → 行動。同じ種類なら味方（並び順）→ 敵（並び順）。
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
import { EVENT_TRIGGERS } from './eventTriggers.js';

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
    /** 即時発動の再帰防止用。特技IDではなくユニット＋特技の組で管理する。 */
    resolvingImmediate: [],
    immediateDepth: 0,
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
      if (s.expiresAt == null) continue;
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
        case 'sourceAttacker':
          return act.sourceAttacker?.alive ? [act.sourceAttacker] : [];
        default:
          return [];
      }
    },
    dealDamage(attacker, target, power, element, results, breakPower = 1, damageType = 'physical', scalingStat = null, triggerHitPassives = true) {
      const evasion = effectiveStat(target, 'evasion');
      if (evasion > 0 && battle.rng.chance(Math.min(0.95, evasion / 100))) {
        results.push({ kind: 'miss', targetId: target.id });
        return false;
      }
      const amount = computeDamage({ attacker, target, power, element, rng: battle.rng, balance: data.balance, damageType, scalingStat });
      const beforePct = hpPct(target);
      applyDamage(battle, target, amount, results, { element });
      if (target.alive && target.boss) {
        reduceBreak(battle, target, breakPower, results);
        checkPhase(target, results);
      }
      if (target.alive) triggerImmediateSkills(battle, data, {
        type: 'damaged', target, source: attacker, primaryTarget: attacker,
        beforePct, afterPct: hpPct(target),
      });
      if (triggerHitPassives) {
        const passiveApi = {
          markerStacks: (unit, markerId) => api.markerStacks(unit, markerId),
          addMarker: (unit, markerId, value) => api.addMarker(unit, markerId, value, results, { primaryTarget: target }),
          chance: (chance) => battle.rng.chance(chance),
        };
        for (const p of attacker.passives) {
          PASSIVE_EFFECTS[p.effect.type]?.afterAttackHit?.(p.effect, attacker, target, passiveApi, { damageType, element });
        }
      }
      return true;
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
      const resistance = Math.min(1, Math.max(0, target.statusResistances?.[statusId] ?? target.statusResistances?.['*'] ?? 0));
      const finalChance = Math.min(1, Math.max(0, chance * (1 - resistance)));
      if (finalChance < 1 && !battle.rng.chance(finalChance)) {
        results.push({ kind: 'statusResisted', targetId: target.id, statusId });
        return;
      }
      const existing = target.statuses.find((s) => s.statusId === statusId);
      if (existing) {
        if (def.durationTurns != null) existing.remainingTurns = def.durationTurns;
        else existing.expiresAt = t() + def.durationMs;
        results.push({ kind: 'statusRefreshed', targetId: target.id, statusId });
        return;
      }
      const inst = {
        statusId,
        kind: def.kind,
        params: { ...def.params },
        expiresAt: def.durationMs != null ? t() + def.durationMs : null,
        nextTickAt: null,
        remainingTurns: def.durationTurns ?? null,
        turnTiming: def.turnTiming ?? 'actionEnd',
      };
      target.statuses.push(inst);
      STATUS_KINDS[def.kind]?.onApply?.(inst, target, t());
      results.push({ kind: 'statusApplied', targetId: target.id, statusId });
    },
    markerStacks(target, markerId) {
      return target.markers?.[markerId]?.stacks ?? 0;
    },
    resourceItems(target, resourceId) {
      return target.resources?.[resourceId]?.items ?? [];
    },
    addResourceItems(target, resourceId, items, max, results = []) {
      const state = target.resources[resourceId] ?? { items: [] };
      const added = items.slice(0, Math.max(0, max - state.items.length));
      state.items.push(...added);
      target.resources[resourceId] = state;
      results.push({ kind: 'resourceChanged', targetId: target.id, resourceId, added, items: [...state.items] });
      return added;
    },
    addRandomResourceItems(target, resourceId, pool, count, max, results = []) {
      const state = target.resources[resourceId] ?? { items: [] };
      let actualCount = count;
      if (state.doubleNext && count > 0) {
        actualCount += 1;
        state.doubleNext = false;
      }
      target.resources[resourceId] = state;
      return api.addResourceItems(target, resourceId, Array.from({ length: actualCount }, () => battle.rng.pick(pool)), max, results);
    },
    armDoubleNextResource(target, resourceId, results = []) {
      const state = target.resources[resourceId] ?? { items: [] };
      state.doubleNext = true;
      target.resources[resourceId] = state;
      results.push({ kind: 'resourceDoubleArmed', targetId: target.id, resourceId });
    },
    consumeResourceItems(target, resourceId, items, results = []) {
      const state = target.resources?.[resourceId];
      if (!state) return false;
      const copy = [...state.items];
      for (const item of items) {
        const i = copy.indexOf(item);
        if (i < 0) return false;
        copy.splice(i, 1);
      }
      state.items = copy;
      results.push({ kind: 'resourceChanged', targetId: target.id, resourceId, consumed: items, items: [...copy] });
      return true;
    },
    randomInt(min, max) {
      return battle.rng.int(min, max);
    },
    addMarker(target, markerId, amount, results = [], context = {}) {
      if (!target) return 0;
      const def = data.get('markers', markerId);
      // 種族共通マーカーは該当種族だけが保持できる。未指定のマーカーは従来どおり全ユニットが利用可能。
      if (def.allowedSpeciesIds?.length && !def.allowedSpeciesIds.some((speciesId) => target.speciesIds?.includes(speciesId))) {
        return 0;
      }
      const state = target.markers[markerId] ?? { stacks: 0, reachedMaxAt: null };
      const before = state.stacks;
      state.stacks = Math.min(def.maxStacks, Math.max(0, before + amount));
      if (before < def.maxStacks && state.stacks === def.maxStacks) state.reachedMaxAt = battle.timeMs;
      target.markers[markerId] = state;
      const actual = state.stacks - before;
      results.push({ kind: 'markerChanged', targetId: target.id, markerId, amount: actual, value: state.stacks });
      if (actual !== 0) {
        triggerImmediateSkills(battle, data, {
          type: 'markerChanged', target, markerId, before, after: state.stacks,
          primaryTarget: context.primaryTarget ?? null,
        });
        if (actual > 0) {
          for (const owner of battle.units.filter((u) => u.alive)) {
            const passiveApi = {
              addRandomResourceItems: (unit, resourceId, pool, count, max) => api.addRandomResourceItems(unit, resourceId, pool, count, max, results),
            };
            for (const p of owner.passives) {
              PASSIVE_EFFECTS[p.effect.type]?.onMarkerIncreased?.(p.effect, owner, p.key, passiveApi, { markerId, amount: actual, target });
            }
          }
        }
      }
      return actual;
    },
    collectMarker(targets, markerId, results = []) {
      if (!targets.length) return;
      let chosen = targets[0];
      for (const target of targets) {
        if ((target.markers[markerId]?.stacks ?? 0) > (chosen.markers[markerId]?.stacks ?? 0)) chosen = target;
      }
      const total = targets.reduce((n, target) => n + (target.markers[markerId]?.stacks ?? 0), 0);
      const max = data.get('markers', markerId).maxStacks;
      for (const target of targets) {
        const before = target.markers[markerId]?.stacks ?? 0;
        if (before > 0) target.markers[markerId] = { stacks: 0, reachedMaxAt: null };
      }
      const value = Math.min(max, total);
      chosen.markers[markerId] = { stacks: value, reachedMaxAt: value === max ? battle.timeMs : null };
      results.push({ kind: 'markerCollected', targetId: chosen.id, markerId, value, lost: Math.max(0, total - max) });
    },
    scheduleEffects(actor, afterTurns, effects, sourceSkill, results = []) {
      const completionEffects = [...effects];
      for (const skillId of actor.skills) {
        const combo = data.find('skills', skillId);
        if (combo?.comboFrom === sourceSkill?.id) completionEffects.push(...(combo.completionEffects ?? []));
      }
      actor.pendingActionEffects.push({ turnsLeft: afterTurns, effects: completionEffects, sourceSkillId: sourceSkill?.id ?? null });
      results.push({ kind: 'effectsScheduled', targetId: actor.id, afterTurns, sourceSkillId: sourceSkill?.id ?? null });
    },
    unitsBySpecies(speciesId, scope, actor) {
      const units = battle.units.filter((u) => u.alive && u.speciesIds.includes(speciesId));
      if (scope === 'all') return units;
      if (scope === 'allies') return units.filter((u) => u.side === actor.side);
      if (scope === 'alliesExceptSelf') return units.filter((u) => u.side === actor.side && u !== actor);
      return [];
    },
    addAttackCount(target, amount, results = []) {
      if (!(amount > 0) || !target.alive) return;
      target.attackCount += amount;
      results.push({ kind: 'attackCountChanged', targetId: target.id, amount, value: target.attackCount });
      // 直接加算だけでは条件判定や特技発動を行わない。
    },
    randomAttackElement() {
      return battle.rng.pick(data.list('elements').filter((e) => e.attackElement).map((e) => e.id));
    },
    bestAttackElement(target) {
      const ids = data.list('elements').filter((e) => e.attackElement).map((e) => e.id);
      let best = ids[0] ?? null;
      for (const id of ids) {
        if ((target.elementMultipliers[id] ?? 1) > (target.elementMultipliers[best] ?? 1)) best = id;
      }
      return best;
    },
    checkCondition(condition, act) {
      const allies = aliveOf(battle, act.actor.side);
      const enemies = aliveOf(battle, act.actor.side === 'ally' ? 'enemy' : 'ally');
      return checkCondition(condition, {
        self: act.actor, allies, enemies, target: act.primaryTarget, rng: battle.rng,
        attackCount: act.actor.attackCount, turnCount: act.actor.turnCount,
      });
    },
    queueAttackCombo(actor, sourceSkill, results = []) {
      for (const skillId of actor.skills) {
        const combo = data.find('skills', skillId);
        if (combo?.comboFrom !== sourceSkill?.id) continue;
        actor.pendingAttackEffects.push({ effects: [...(combo.completionEffects ?? [])], sourceSkillId: sourceSkill.id, comboSkillId: combo.id });
        results.push({ kind: 'attackComboQueued', targetId: actor.id, sourceSkillId: sourceSkill.id, comboSkillId: combo.id });
      }
    },
  };
  return api;
}

/** 条件成立時即時発動。ターン・攻撃回数を消費せず、再帰深度と同一特技の再入を制限する。 */
function triggerImmediateSkills(battle, data, triggerEvent) {
  if (battle.immediateDepth >= 16) return;
  const actor = triggerEvent.target;
  if (!actor?.alive) return;
  const api = makeApi(battle, data);
  const keyOf = (skillId) => `${actor.id}:${skillId}`;
  battle.immediateDepth += 1;
  try {
    for (const skillId of actor.skills) {
      const skill = data.find('skills', skillId);
      const trigger = skill?.immediateTrigger;
      const def = trigger && EVENT_TRIGGERS[trigger.type];
      if (!def || battle.resolvingImmediate.includes(keyOf(skillId))) continue;
      if (skill.oncePerBattle && actor.usedSkills.includes(skill.id)) continue;
      if (actor.usesMp && actor.mp < skill.mpCost) continue;
      if (!def.matches(trigger, { event: triggerEvent, actor, rng: battle.rng })) continue;

      const foes = aliveOf(battle, actor.side === 'ally' ? 'enemy' : 'ally');
      const primaryTarget = triggerEvent.primaryTarget?.alive ? triggerEvent.primaryTarget : foes[0] ?? null;
      const results = [];
      const immediate = {
        t: battle.timeMs, type: 'action', actorId: actor.id,
        turnCount: actor.turnCount, attackCount: actor.attackCount, countsAsAttack: false,
        kind: 'immediate', skillId: skill.id, skippedForMp: [], charged: false, results,
      };
      if (actor.usesMp) actor.mp -= skill.mpCost;
      if (skill.oncePerBattle) actor.usedSkills.push(skill.id);
      battle.resolvingImmediate.push(keyOf(skillId));
      try {
        const actCtx = { actor, primaryTarget, skill, results, sourceAttacker: triggerEvent.source ?? null };
        for (const effect of skill.effects) EFFECTS[effect.type]?.apply(effect, api, actCtx);
      } finally {
        battle.resolvingImmediate = battle.resolvingImmediate.filter((k) => k !== keyOf(skillId));
      }
      actor.lastAction = { t: battle.timeMs, kind: 'skill', skillId: skill.id };
      battle.log.push(immediate);
    }
  } finally {
    battle.immediateDepth -= 1;
  }
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

/**
 * 1回の行動機会。
 * turnCount は必ず1増える。attackCount は通常攻撃または countsAsAttack !== false の特技だけ1増える。
 * 攻撃回数条件は attackCount だけで判定し、turnCount は参照しない。
 */
function act(battle, data, actor) {
  const api = makeApi(battle, data);
  actor.turnCount += 1;
  const actionStartStatuses = [...actor.statuses];
  const skipsAction = actionStartStatuses.some((s) => STATUS_KINDS[s.kind]?.skipsAction);
  processTurnStatuses(battle, actor, 'actionStart', actionStartStatuses);
  if (!actor.alive) {
    battle.log.push({
      t: battle.timeMs, type: 'action', actorId: actor.id, turnCount: actor.turnCount,
      attackCount: actor.attackCount, countsAsAttack: false, kind: 'interrupted', skillId: null,
      skippedForMp: [], charged: false, results: [],
    });
    return;
  }
  if (skipsAction) {
    const statusesAtTurnStart = [...actor.statuses];
    actor.lastAction = { t: battle.timeMs, kind: 'skipped', skillId: null };
    battle.log.push({
      t: battle.timeMs, type: 'action', actorId: actor.id, turnCount: actor.turnCount,
      attackCount: actor.attackCount, countsAsAttack: false, kind: 'skipped', skillId: null,
      skippedForMp: [], charged: false, results: [],
    });
    processTurnStatuses(battle, actor, 'actionEnd', statusesAtTurnStart);
    actor.nextAttackAt += effectiveInterval(actor);
    return;
  }

  const allies = aliveOf(battle, actor.side);
  const foes = aliveOf(battle, actor.side === 'ally' ? 'enemy' : 'ally');
  // 主な攻撃対象: 味方は先頭の敵を集中攻撃、敵は味方をランダムに狙う
  let primaryTarget = actor.side === 'ally' ? foes[0] : battle.rng.pick(foes);
  const results = [];

  // 前回以前の行動で予約された完成処理。ここで付いた強化は今回の通常処理に反映される。
  for (const pending of [...actor.pendingActionEffects]) {
    pending.turnsLeft -= 1;
    if (pending.turnsLeft > 0) continue;
    const pendingCtx = { actor, primaryTarget, skill: null, results };
    for (const effect of pending.effects) EFFECTS[effect.type]?.apply(effect, api, pendingCtx);
    actor.pendingActionEffects = actor.pendingActionEffects.filter((p) => p !== pending);
    results.push({ kind: 'scheduledEffectsCompleted', targetId: actor.id, sourceSkillId: pending.sourceSkillId });
  }
  const statusesAtTurnStart = [...actor.statuses];
  const nextAttackCount = actor.attackCount + 1;
  const condCtx = { self: actor, allies, enemies: foes, target: primaryTarget, rng: battle.rng, turnCount: actor.turnCount };

  // ボスの大技: 決まった回数ごとに力をため（予兆）、ため終わったら必ず放つ
  let forced = null;
  const charge = actor.boss?.charge;
  if (charge && !actor.boss.removedSkills.includes(charge.skillId)) {
    if (actor.charging) {
      actor.charging = false;
      forced = data.get('skills', charge.skillId);
    } else if (nextAttackCount % charge.everyNAttacks === 0) {
      actor.charging = true;
      actor.nextAttackAt = battle.timeMs + charge.chargeMs;
      actor.lastAction = { t: battle.timeMs, kind: 'charge', skillId: charge.skillId };
      battle.log.push({
        t: battle.timeMs, type: 'chargeStart', actorId: actor.id, turnCount: actor.turnCount,
        attackCount: actor.attackCount, skillId: charge.skillId, message: charge.message ?? null,
      });
      processTurnStatuses(battle, actor, 'actionEnd', statusesAtTurnStart);
      return;
    }
  }

  let used = forced;
  const skippedForMp = [];
  for (const skillId of forced ? [] : actor.skills) {
    const skill = data.find('skills', skillId);
    if (!skill) continue;
    if (skill.comboFrom) continue;
    if (skill.immediateTrigger) continue;
    if (skill.oncePerBattle && actor.usedSkills.includes(skill.id)) continue;
    // 攻撃特技は「今回成立する攻撃回数」、非攻撃特技は「成立済みの攻撃回数」で条件判定する。
    const conditionAttackCount = skill.countsAsAttack === false ? actor.attackCount : nextAttackCount;
    if (!checkCondition(skill.trigger, { ...condCtx, attackCount: conditionAttackCount })) continue;
    if (skill.countsAsAttack === false && actor.nonAttackSkillUses[skillId] === actor.attackCount) continue;
    if (actor.usesMp && actor.mp < skill.mpCost) {
      skippedForMp.push(skillId);
      continue;
    }
    used = skill;
    break;
  }

  if (used?.targetSelector?.type === 'enemyMarkerOldest') {
    const markerId = used.targetSelector.markerId;
    const min = used.targetSelector.stacks ?? 1;
    primaryTarget = foes
      .filter((u) => (u.markers[markerId]?.stacks ?? 0) >= min)
      .sort((a, b) => (a.markers[markerId]?.reachedMaxAt ?? Infinity) - (b.markers[markerId]?.reachedMaxAt ?? Infinity) || battle.units.indexOf(a) - battle.units.indexOf(b))[0] ?? primaryTarget;
  }

  const countsAsAttack = !used || used.countsAsAttack !== false;
  if (countsAsAttack) {
    actor.attackCount = nextAttackCount;
    for (const p of actor.passives) PASSIVE_EFFECTS[p.effect.type]?.onAttackStart?.(p.effect, actor, p.key);
  } else {
    actor.nonAttackSkillUses[used.id] = actor.attackCount;
  }
  if (used?.oncePerBattle) actor.usedSkills.push(used.id);

  const event = {
    t: battle.timeMs,
    type: 'action',
    actorId: actor.id,
    turnCount: actor.turnCount,
    attackCount: actor.attackCount,
    countsAsAttack,
    kind: used ? 'skill' : 'normal',
    skillId: used?.id ?? null,
    skippedForMp,
    charged: Boolean(forced),
    results,
  };
  const actCtx = { actor, primaryTarget, skill: used, results };

  // 予約済み連携は「次の実際の攻撃」の直前に1回だけ解決する。
  if (countsAsAttack && actor.pendingAttackEffects.length) {
    for (const pending of [...actor.pendingAttackEffects]) {
      for (const effect of pending.effects) EFFECTS[effect.type]?.apply(effect, api, actCtx);
      actor.pendingAttackEffects = actor.pendingAttackEffects.filter((p) => p !== pending);
      results.push({ kind: 'attackComboTriggered', targetId: actor.id, comboSkillId: pending.comboSkillId, sourceSkillId: pending.sourceSkillId });
    }
  }

  if (used) {
    if (actor.usesMp && !forced) actor.mp -= used.mpCost;
    for (const effect of used.effects) EFFECTS[effect.type]?.apply(effect, api, actCtx);
  } else if (primaryTarget) {
    // 追加攻撃は同じ行動内のため attackCount を増やさない。
    for (const status of actor.statuses) {
      if (status.kind !== 'additionalNormalAttack') continue;
      const extraAct = { actor, primaryTarget, skill: null, results };
      for (const target of api.targets(status.params.target, extraAct)) {
        const hit = api.dealDamage(actor, target, status.params.power, status.params.element ?? null, results, 1, status.params.damageType);
        if (hit && status.params.markerId) api.addMarker(target, status.params.markerId, status.params.markerAmount ?? 1, results);
      }
    }
    const hit = api.dealDamage(actor, primaryTarget, data.balance.normalAttack.power, null, results, 1);
    if (hit) {
      const passiveApi = { addMarker: (target, markerId, amount) => api.addMarker(target, markerId, amount, results) };
      for (const p of actor.passives) PASSIVE_EFFECTS[p.effect.type]?.afterNormalAttackHit?.(p.effect, actor, primaryTarget, passiveApi);
    }
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
    const passiveCtx = { attacked: countsAsAttack, turnCount: actor.turnCount, attackCount: actor.attackCount };
    for (const p of actor.passives) PASSIVE_EFFECTS[p.effect.type]?.afterAction?.(p.effect, actor, p.key, passiveApi, passiveCtx);
  }

  actor.lastAction = { t: battle.timeMs, kind: event.kind, skillId: event.skillId };
  battle.log.push(event);
  processTurnStatuses(battle, actor, 'actionEnd', statusesAtTurnStart);
  actor.nextAttackAt += effectiveInterval(actor);
}

/** 対象ユニットの行動開始/終了を基準にする状態効果を1ターンぶん処理する。 */
function processTurnStatuses(battle, unit, timing, statusesAtTurnStart) {
  for (const status of statusesAtTurnStart) {
    if (!unit.statuses.includes(status) || status.remainingTurns == null || status.turnTiming !== timing) continue;
    const results = [];
    const kind = STATUS_KINDS[status.kind];
    if (kind?.ticks && unit.alive) {
      if (kind.tickHeal) {
        const amount = Math.min(unit.maxHp - unit.hp, kind.tickHeal(status, unit));
        unit.hp += amount;
        results.push({ kind: 'heal', targetId: unit.id, amount, source: 'status' });
      } else applyDamage(battle, unit, kind.tickDamage(status, unit), results);
      battle.log.push({ t: battle.timeMs, type: 'statusTick', targetId: unit.id, statusId: status.statusId, results });
    }
    status.remainingTurns -= 1;
    if (status.remainingTurns <= 0) statusExpire(battle, unit, status);
    if (!unit.alive) break;
  }
}

function statusTick(battle, unit, status) {
  const kind = STATUS_KINDS[status.kind];
  const results = [];
  if (kind.tickHeal) {
    const amount = Math.min(unit.maxHp - unit.hp, kind.tickHeal(status, unit));
    unit.hp += amount;
    results.push({ kind: 'heal', targetId: unit.id, amount, source: 'status' });
  } else applyDamage(battle, unit, kind.tickDamage(status, unit), results);
  battle.log.push({ t: battle.timeMs, type: 'statusTick', targetId: unit.id, statusId: status.statusId, results });
  status.nextTickAt += status.params.tickMs;
}

function statusExpire(battle, unit, status) {
  unit.statuses = unit.statuses.filter((s) => s !== status);
  battle.log.push({ t: battle.timeMs, type: 'statusEnd', targetId: unit.id, statusId: status.statusId });
}

// テストや画面から使う補助
export { effectiveStat, effectiveInterval };
