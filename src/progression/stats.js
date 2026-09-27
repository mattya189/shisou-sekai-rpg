/**
 * ユニットの能力値計算。戦闘・画面表示の両方でこれを使う。
 *
 * 計算順:
 *   1. 基礎値 + 成長値 ×（レベル-1）
 *   2. × ランク倍率（balance.ranks）
 *   3. + 装備（基本能力 + 強化値 × 強化ごとの上昇 + ランダム能力）
 *   4. × 静的パッシブ（src/battle/passives.js で static: true のもの）
 *   5. 小数切り捨て
 * 攻撃間隔は 基礎攻撃間隔 ×（1 - 装備の intervalPct 合計 / 100）、下限 balance.minAttackIntervalMs
 */
import { UNIT_STAT_KEYS, OPTIONAL_UNIT_STAT_KEYS } from '../core/constants.js';
import { equipmentInstancesOf } from './equipment.js';

export function computeStats(data, unit, equipmentInstances = []) {
  const { def } = data.getUnitDef(unit.defId);
  const balance = data.balance;
  const rank = balance.ranks.find((r) => r.rank === unit.rank) ?? balance.ranks[0];

  const stats = {};
  const statKeys = [...UNIT_STAT_KEYS, ...OPTIONAL_UNIT_STAT_KEYS.filter((k) => def.baseStats[k] != null || def.growth?.[k] != null)];
  for (const k of statKeys) {
    stats[k] = ((def.baseStats[k] ?? 0) + (def.growth?.[k] ?? 0) * (unit.level - 1)) * rank.statMultiplier;
  }

  let intervalPct = 0;
  const add = (bonus, times = 1) => {
    for (const [k, v] of Object.entries(bonus ?? {})) {
      if (k === 'intervalPct') intervalPct += v * times;
      else if (k in stats) stats[k] += v * times;
    }
  };
  for (const inst of equipmentInstances) {
    const eq = data.find('equipment', inst.defId);
    if (!eq) continue;
    add(eq.baseStats);
    add(eq.enhancePerPlus, inst.plus ?? 0);
    for (const r of inst.randomStats ?? []) add({ [r.stat]: r.value });
  }

  for (const pid of def.passives ?? []) {
    const passive = data.find('passives', pid);
    for (const e of passive?.effects ?? []) {
      if (e.type === 'flatStatPct' && e.stat in stats) stats[e.stat] *= 1 + e.pct / 100;
    }
  }

  for (const k of statKeys) stats[k] = Math.floor(stats[k]);
  stats.attackIntervalMs = Math.max(
    balance.minAttackIntervalMs,
    Math.round(def.baseStats.attackIntervalMs * (1 - intervalPct / 100)),
  );
  return stats;
}

/** 所持ユニットの現在の能力値 */
export function unitStats(save, data, unitId) {
  const unit = save.units[unitId];
  return computeStats(data, unit, equipmentInstancesOf(save, unit));
}
