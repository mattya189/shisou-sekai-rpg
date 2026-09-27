/**
 * 状態異常の種類（kind）レジストリ。data/statuses.json の kind と対応する。
 *
 * 新しい種類を追加するときは、ここに1件追加する。使えるフック:
 *   params           : 必須パラメータ名（データ検証）
 *   onApply(inst, unit, timeMs) : かかった瞬間の処理
 *   ticks            : true なら params.tickMs ごとに tickDamage を与える
 *   tickDamage(inst, unit)      : 継続ダメージ量
 *   statPct(inst, stat)         : 能力値の増減（%）
 *   intervalBonusMs(inst)       : 攻撃間隔の延長（ミリ秒）
 *
 * inst は戦闘中の状態異常: { statusId, kind, params, expiresAt, nextTickAt }
 */

export const STATUS_KINDS = {
  damageOverTime: {
    params: ['pctOfMaxHp', 'tickMs'],
    ticks: true,
    onApply(inst, unit, timeMs) {
      inst.nextTickAt = timeMs + inst.params.tickMs;
    },
    tickDamage(inst, unit) {
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
};

export function validateStatusDef(entry) {
  const kind = STATUS_KINDS[entry.kind];
  if (!kind) return [`kind "${entry.kind}" は未登録の状態異常です（src/battle/statusEffects.js）`];
  return kind.params
    .filter((p) => entry.params?.[p] === undefined)
    .map((p) => `状態異常 ${entry.kind} には params.${p} が必要です`);
}
