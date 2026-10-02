/**
 * 特技の「次の発動条件到達」を戦闘状態から読み取る。戦闘状態・乱数は一切変更しない。
 *
 * 判定は src/battle/conditions.js の checkCondition をそのまま使い、
 * engine.js の act() と同じ規則で攻撃回数を当てはめる:
 *   - 攻撃として成立する特技（countsAsAttack !== false）は「今回成立する攻撃回数」= attackCount + 1 以降で判定
 *   - 非攻撃特技（countsAsAttack: false）は「成立済みの攻撃回数」で判定し、同じ攻撃回数で連続発動しない
 *
 * ここで出す到達回数は参考値。MP不足・使用済み・優先度・ほかの条件で発動しないことがあり、
 * その理由は blockers に入れる。攻撃回数と無関係な条件には到達回数を付けない。
 */
import { checkCondition } from './conditions.js';
import { aliveOf } from './engine.js';

const COUNT_TYPES = new Set(['attackCountMultiple', 'attackCountEvery']);
const SEARCH_LIMIT = 10000;

/** 攻撃回数だけで決まる条件か（all/any の入れ子も含む） */
export function isAttackCountOnly(condition) {
  if (!condition) return false;
  if (COUNT_TYPES.has(condition.type)) return true;
  if ((condition.type === 'all' || condition.type === 'any') && Array.isArray(condition.of) && condition.of.length) {
    return condition.of.every(isAttackCountOnly);
  }
  return false;
}

/** 条件の中に攻撃回数条件が含まれるか */
export function involvesAttackCount(condition) {
  if (!condition) return false;
  if (COUNT_TYPES.has(condition.type)) return true;
  return Array.isArray(condition.of) && condition.of.some(involvesAttackCount);
}

/**
 * 条件を「攻撃回数の部分」と「それ以外」に分ける。
 * 攻撃回数部分を独立に計算できるのは、全体が攻撃回数だけ、または all の直下で分かれている場合だけ。
 * @returns {{ countPart: object|null, otherParts: object[] }}
 */
export function splitAttackCountCondition(condition) {
  if (isAttackCountOnly(condition)) return { countPart: condition, otherParts: [] };
  if (condition?.type === 'all' && Array.isArray(condition.of)) {
    const countParts = condition.of.filter(isAttackCountOnly);
    const otherParts = condition.of.filter((c) => !isAttackCountOnly(c));
    if (countParts.length) {
      return { countPart: countParts.length === 1 ? countParts[0] : { type: 'all', of: countParts }, otherParts };
    }
  }
  return { countPart: null, otherParts: condition ? [condition] : [] };
}

/** from 以上で、攻撃回数条件を満たす最小の攻撃回数（見つからなければ null） */
export function nextAttackCountFor(countCondition, from) {
  const start = Math.max(1, from);
  for (let m = start; m < start + SEARCH_LIMIT; m += 1) {
    if (checkCondition(countCondition, { attackCount: m })) return m;
  }
  return null;
}

function findChance(condition) {
  if (!condition) return null;
  if (condition.type === 'randomChance') return condition.chance;
  if (condition.type === 'all' && Array.isArray(condition.of)) {
    for (const c of condition.of) {
      const chance = findChance(c);
      if (chance != null) return chance;
    }
  }
  return null;
}

function containsRandom(condition) {
  if (!condition) return false;
  if (condition.type === 'randomChance') return true;
  return Array.isArray(condition.of) && condition.of.some(containsRandom);
}

/**
 * ほかの条件を「今の状態」で判定する。乱数を含む条件は判定しない（null）。
 * 味方の主な対象は先頭の敵（engine と同じ）。敵はランダムに狙うため対象依存の条件は判定しない。
 */
function evaluateNow(conditions, unit, battle) {
  if (!conditions.length) return null;
  if (conditions.some(containsRandom)) return null;
  const allies = aliveOf(battle, unit.side);
  const enemies = aliveOf(battle, unit.side === 'ally' ? 'enemy' : 'ally');
  const target = unit.side === 'ally' ? enemies[0] ?? null : null;
  const ctx = { self: unit, allies, enemies, target, attackCount: unit.attackCount, turnCount: unit.turnCount };
  try {
    return conditions.every((c) => checkCondition(c, ctx));
  } catch {
    return null;
  }
}

/**
 * @param {any} unit 戦闘ユニット（combatant）
 * @param {any} battle
 * @param {import('../core/gameData.js').GameData} data
 * @returns {Array<{
 *   skillId: string, skill: any, category: 'attackCount'|'chance'|'immediate'|'combo'|'condition'|'missing',
 *   countsAsAttack: boolean, nextAttackCount: number|null, otherConditions: object[], otherConditionsMet: boolean|null,
 *   chance: number|null, blockers: Array<{ code: string, skillId?: string, mp?: number, mpCost?: number }>
 * }>}
 */
export function skillForecast(unit, battle, data) {
  const items = (unit.skills ?? []).map((skillId) => {
    const skill = data.find('skills', skillId);
    if (!skill) {
      return { skillId, skill: null, category: 'missing', countsAsAttack: true, nextAttackCount: null, otherConditions: [], otherConditionsMet: null, chance: null, blockers: [] };
    }
    const countsAsAttack = skill.countsAsAttack !== false;
    const base = { skillId, skill, countsAsAttack, nextAttackCount: null, otherConditions: [], otherConditionsMet: null, chance: null, blockers: [] };
    if (skill.immediateTrigger) return { ...base, category: 'immediate', chance: skill.immediateTrigger.chance ?? null };
    if (skill.comboFrom) return { ...base, category: 'combo' };

    const { countPart, otherParts } = splitAttackCountCondition(skill.trigger);
    const chance = findChance(skill.trigger);
    if (countPart) {
      let from = unit.attackCount + 1;
      if (!countsAsAttack && unit.nonAttackSkillUses?.[skillId] !== unit.attackCount) from = unit.attackCount;
      return {
        ...base,
        category: 'attackCount',
        nextAttackCount: nextAttackCountFor(countPart, from),
        otherConditions: otherParts,
        otherConditionsMet: evaluateNow(otherParts, unit, battle),
        chance,
      };
    }
    if (chance != null) return { ...base, category: 'chance', chance };
    return { ...base, category: 'condition', otherConditions: otherParts, otherConditionsMet: evaluateNow(otherParts, unit, battle) };
  });

  for (const item of items) {
    const skill = item.skill;
    if (!skill) continue;
    if (!unit.alive) item.blockers.push({ code: 'down' });
    if (skill.oncePerBattle && unit.usedSkills?.includes(skill.id)) item.blockers.push({ code: 'used' });
    if (unit.usesMp && Number(skill.mpCost ?? 0) > unit.mp && item.category !== 'combo') {
      item.blockers.push({ code: 'mp', mp: unit.mp, mpCost: skill.mpCost });
    }
    if (item.category === 'attackCount' && item.otherConditionsMet === false) item.blockers.push({ code: 'otherCondition' });
  }

  // 同じ攻撃回数に到達する、優先度（セット順）の高い特技が先に判定される。
  items.forEach((item, index) => {
    if (item.category !== 'attackCount' || item.nextAttackCount == null) return;
    const earlier = items.slice(0, index).find((other) => other.category === 'attackCount'
      && other.nextAttackCount === item.nextAttackCount
      && other.countsAsAttack === item.countsAsAttack
      && !other.blockers.some((b) => b.code === 'used' || b.code === 'down'));
    if (earlier) item.blockers.push({ code: 'priority', skillId: earlier.skillId });
  });
  return items;
}
