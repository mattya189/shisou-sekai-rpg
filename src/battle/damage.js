/**
 * ダメージ計算。数値は data/balance.json の battle で調整する。
 *
 *   基本 = 攻撃力 × 威力 × K / (K + 防御力)      K = battle.defenseConstant
 *   × 属性倍率（受ける側の elementMultipliers）
 *   × 乱数幅（1 ± battle.damageVariance）
 *   × (1 + (パッシブのダメージ増加% + BREAK中の被ダメージ増加%) / 100)
 *   四捨五入、最低1
 */
import { effectiveStat } from './combatant.js';
import { PASSIVE_EFFECTS } from './passives.js';

export function computeDamage({ attacker, target, power, element, rng, balance, damageType = 'physical' }) {
  const atk = effectiveStat(attacker, damageType === 'magic' ? 'matk' : 'atk');
  const def = effectiveStat(target, damageType === 'magic' ? 'mdef' : 'def');
  const k = balance.battle.defenseConstant;
  const base = (atk * power * k) / (k + def);
  const elem = element ? target.elementMultipliers[element] ?? 1 : 1;
  const v = balance.battle.damageVariance;
  const variance = v > 0 ? 1 + (rng.next() * 2 - 1) * v : 1;
  let pct = 0;
  for (const p of attacker.passives) pct += PASSIVE_EFFECTS[p.effect.type]?.damagePct?.(p.effect, attacker, target) ?? 0;
  // BREAK中のボスは被ダメージが増える
  if (target.broken && target.boss?.break) pct += target.boss.break.damageTakenPct;
  return Math.max(1, Math.round(base * elem * variance * (1 + pct / 100)));
}
