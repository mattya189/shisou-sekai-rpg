/**
 * 戦闘に参加するユニット（combatant）の作成と、戦闘中の実効値の計算。
 */
import { computeStats } from '../progression/stats.js';
import { learnedSkillIds } from '../progression/skillLoadout.js';
import { STATUS_KINDS } from './statusEffects.js';
import { PASSIVE_EFFECTS } from './passives.js';

/**
 * @param {import('../core/gameData.js').GameData} data
 * @param {{
 *   defId: string, level?: number, rank?: number,
 *   skills?: string[],          // 優先順位順。省略時は習得済みの先頭から最大数
 *   extraSkills?: string[],
 *   equipment?: any[],          // 装備個体
 *   hp?: number, mp?: number,   // 開始時のHP/MP（省略時は最大）
 *   usesMp?: boolean,           // 省略時: 味方は true、敵は false（敵はMP不要）
 *   unitId?: string,            // セーブ上のユニットID（味方のみ）
 * }} spec
 * @param {{ id: string, side: 'ally' | 'enemy' }} slot
 */
export function createCombatant(data, spec, { id, side }) {
  const { def, kind } = data.getUnitDef(spec.defId);
  const unitLike = {
    defId: spec.defId,
    level: spec.level ?? 1,
    rank: spec.rank ?? 1,
    equippedSkills: [],
    extraSkills: spec.extraSkills ?? [],
    equipment: [],
  };
  const stats = computeStats(data, unitLike, spec.equipment ?? []);
  const skills = spec.skills ?? learnedSkillIds(data, unitLike).slice(0, data.balance.skills.maxEquipped);
  const passives = (def.passives ?? []).flatMap((pid) =>
    (data.find('passives', pid)?.effects ?? []).map((effect, i) => ({ key: `${pid}:${i}`, passiveId: pid, effect })),
  );
  const usesMp = spec.usesMp ?? side === 'ally';
  const hp = clamp(spec.hp ?? stats.hp, 0, stats.hp);
  return {
    id,
    side,
    unitId: spec.unitId ?? null,
    defId: spec.defId,
    kind,
    name: def.name,
    image: def.image ?? null,
    level: unitLike.level,
    element: def.element ?? null,
    elementMultipliers: def.elementMultipliers ?? {},
    stats,
    maxHp: stats.hp,
    maxMp: stats.mp,
    hp,
    mp: usesMp ? clamp(spec.mp ?? stats.mp, 0, stats.mp) : 0,
    usesMp,
    skills: [...skills],
    passives,
    passiveState: {},
    statuses: [],
    /** 戦闘中ずっと続く能力増減（%）。ボスのフェーズ・ギミック・部位破壊などで変わる */
    buffs: {},
    /** かからない状態異常 */
    statusImmune: [],
    /** ボスの設定と状態（ボス以外は null） */
    boss: null,
    /** 部位なら true。partOfUnit は本体 */
    isPart: false,
    attackCount: 0,
    nextAttackAt: stats.attackIntervalMs,
    alive: hp > 0,
    /** ボス用（Phase 7）: BREAK中・大技準備中 */
    broken: false,
    charging: false,
    /** 画面表示用: 最後の行動 */
    lastAction: null,
  };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** 状態異常とパッシブを反映した能力値（小数のまま） */
export function effectiveStat(unit, stat) {
  let pct = 0;
  for (const s of unit.statuses) pct += STATUS_KINDS[s.kind]?.statPct?.(s, stat) ?? 0;
  for (const p of unit.passives) pct += PASSIVE_EFFECTS[p.effect.type]?.statPct?.(p.effect, unit, p.key, stat) ?? 0;
  pct += unit.buffs?.[stat] ?? 0;
  return Math.max(0, unit.stats[stat] * (1 + pct / 100));
}

/** 状態異常を反映した攻撃間隔 */
export function effectiveInterval(unit) {
  let ms = unit.stats.attackIntervalMs;
  for (const s of unit.statuses) ms += STATUS_KINDS[s.kind]?.intervalBonusMs?.(s) ?? 0;
  return ms;
}

/** 能力増減（%）を加える */
export function addBuffs(unit, statPct) {
  for (const [k, v] of Object.entries(statPct ?? {})) unit.buffs[k] = (unit.buffs[k] ?? 0) + v;
}

/**
 * ボス（bosses.json）の戦闘ユニットを作る。部位があれば [部位..., 本体] の順で返す。
 * 味方は先頭の敵から狙うので、部位を先に壊しにいく形になる。
 */
export function createBossUnits(data, spec) {
  const boss = data.get('bosses', spec.bossId);
  const u = createCombatant(data, { defId: boss.monsterId, level: spec.level ?? boss.level, skills: boss.skills, hp: spec.hp }, { id: '', side: 'enemy' });
  u.name = boss.name ?? u.name;
  for (const [k, m] of Object.entries(boss.statMultiplier ?? {})) {
    if (k in u.stats) u.stats[k] = Math.floor(u.stats[k] * m);
  }
  u.maxHp = u.stats.hp;
  u.hp = spec.hp != null ? Math.min(spec.hp, u.maxHp) : u.maxHp;
  u.statusImmune = [...(boss.statusImmune ?? [])];
  const bg = boss.breakGauge;
  u.boss = {
    id: boss.id,
    charge: boss.charge ?? null,
    phases: [...(boss.phases ?? [])].sort((a, b) => b.hpBelowPct - a.hpBelowPct),
    phaseIndex: -1,
    break: bg ? { max: bg.max, gauge: bg.max, durationMs: bg.durationMs, damageTakenPct: bg.damageTakenPct ?? 0, endsAt: null, count: 0 } : null,
    gimmicks: (boss.gimmicks ?? []).map((g) => ({ ...g, done: false })),
    removedSkills: [],
    partsDestroyed: 0,
  };
  const parts = (boss.parts ?? []).map((p) => {
    const hp = Math.max(1, Math.floor((u.maxHp * p.hpPct) / 100));
    return {
      ...createPartBase(),
      name: p.name,
      defId: boss.monsterId,
      kind: 'part',
      level: u.level,
      partKey: p.key,
      partOfUnit: u,
      onDestroy: p.onDestroy ?? null,
      stats: { hp, mp: 0, atk: 0, def: p.def ?? u.stats.def, attackIntervalMs: Infinity },
      maxHp: hp,
      hp,
    };
  });
  return [...parts, u];
}

function createPartBase() {
  return {
    id: '', side: 'enemy', unitId: null, image: null, element: null, elementMultipliers: {},
    maxMp: 0, mp: 0, usesMp: false, skills: [], passives: [], passiveState: {}, statuses: [], buffs: {},
    statusImmune: [], boss: null, isPart: true, attackCount: 0, nextAttackAt: Infinity, alive: true,
    broken: false, charging: false, lastAction: null,
  };
}
