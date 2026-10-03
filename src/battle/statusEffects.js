/**
 * 状態異常の種類（kind）レジストリ。data/statuses.json の kind と対応する。
 *
 * 新しい種類を追加するときは、ここに1件追加する。使えるフック:
 *   params           : 必須パラメータ名（データ検証）
 *   onApply(inst, unit, timeMs) : かかった瞬間の処理
 *   ticks            : true なら時間基準では params.tickMs ごと、ターン基準では指定タイミングにダメージ
 *   tickDamage(inst, unit)      : 継続ダメージ量
 *   statPct(inst, stat)         : 能力値の増減（%）
 *   intervalBonusMs(inst)       : 攻撃間隔の延長（ミリ秒）
 *
 * inst は戦闘中の状態異常:
 * { statusId, kind, params, expiresAt, nextTickAt, remainingTurns, turnTiming }
 */

/** Shared classification for successful enemy-origin debuff events. */
export function isDebuff(def) {
  if (typeof def.debuff === 'boolean') return def.debuff;
  const p = def.params ?? {};
  return ['damageOverTime', 'attackDelay', 'skipAction'].includes(def.kind)
    || (def.kind === 'statModifier' && p.pct < 0)
    || (def.kind === 'flatStatModifier' && p.amount < 0)
    || (def.kind === 'intervalPctModifier' && p.pct > 0)
    || (def.kind === 'multiStatModifier' && (Object.values(p.statPct ?? {}).some((n) => n < 0) || p.intervalPct > 0));
}

export const STATUS_KINDS = {
  nextAttackDamage: { params: ['pct'] },
  damageOverTime: {
    params: ['pctOfMaxHp'],
    ticks: true,
    onApply(inst, unit, timeMs) {
      if (inst.expiresAt != null) inst.nextTickAt = timeMs + inst.params.tickMs;
    },
    tickDamage(inst, unit) {
      return Math.max(1, Math.floor((unit.maxHp * inst.params.pctOfMaxHp) / 100));
    },
  },
  healOverTime: {
    params: ['pctOfMaxHp'],
    ticks: true,
    tickHeal(inst, unit) {
      return Math.max(1, Math.floor((unit.maxHp * inst.params.pctOfMaxHp) / 100));
    },
  },
  attackDelay: {
    params: ['delayMs'],
    onApply(inst, unit) {
      unit.nextAttackAt += inst.params.delayMs;
    },
    intervalBonusMs(inst) {
      return inst.params.delayMs;
    },
  },
  statModifier: {
    params: ['stat', 'pct'],
    statPct(inst, stat) {
      return inst.params.stat === stat ? inst.params.pct : 0;
    },
  },
  flatStatModifier: {
    params: ['stat', 'amount'],
    statFlat(inst, stat) {
      return inst.params.stat === stat ? inst.params.amount : 0;
    },
  },
  multiStatModifier: {
    params: ['statPct'],
    statPct(inst, stat) {
      return inst.params.statPct[stat] ?? 0;
    },
    intervalPct(inst) {
      return inst.params.intervalPct ?? 0;
    },
  },
  intervalPctModifier: {
    params: ['pct'],
    intervalPct(inst) {
      return inst.params.pct;
    },
  },
  /** 通常攻撃直前の追加攻撃。処理は engine の通常攻撃経路が担う。 */
  additionalNormalAttack: {
    params: ['target', 'power', 'damageType'],
  },
  /** 次の行動機会を消費する。turnCount は進むが attackCount は進まない。 */
  skipAction: {
    params: [],
    skipsAction: true,
  },
};

export function validateStatusDef(entry) {
  const kind = STATUS_KINDS[entry.kind];
  if (!kind) return [`kind "${entry.kind}" は未登録の状態異常です（src/battle/statusEffects.js）`];
  const errors = kind.params
    .filter((p) => entry.params?.[p] === undefined)
    .map((p) => `状態異常 ${entry.kind} には params.${p} が必要です`);
  const hasMs = Number.isFinite(entry.durationMs) && entry.durationMs > 0;
  const hasTurns = Number.isInteger(entry.durationTurns) && entry.durationTurns > 0;
  if (!(entry.kind === 'nextAttackDamage' && entry.untilAttack === true && !hasMs && !hasTurns) && hasMs === hasTurns) errors.push('durationMs または durationTurns のどちらか一方を正の値で指定してください');
  if (entry.turnTiming != null && !['actionStart', 'actionEnd'].includes(entry.turnTiming)) {
    errors.push('turnTiming は actionStart または actionEnd を指定してください');
  }
  if (hasMs && kind.ticks && !(entry.params?.tickMs > 0)) {
    errors.push(`時間基準の状態異常 ${entry.kind} には正の params.tickMs が必要です`);
  }
  return errors;
}
