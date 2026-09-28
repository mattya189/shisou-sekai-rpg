/**
 * モンスターの加入判定。
 *
 *   加入率 = 基礎加入率 + 失敗補正 × これまでの失敗回数
 *   失敗回数が guaranteeAfter 以上なら確定加入
 *   成功したら失敗回数は0に戻る
 * 失敗回数はモンスターの種類ごとにセーブ（recruit.failCounts）に保存する。
 * すでに所持している種類が加入した場合は、共通育成素材などに変換される（grantUnit の duplicateTo）。
 * recruit.special があるモンスター（ボスなど）は通常の判定をしない（Phase 7）。
 */
import { grantUnit } from '../progression/units.js';

export function recruitChance(save, data, monsterId) {
  const r = data.get('monsters', monsterId).recruit;
  const fails = save.recruit.failCounts[monsterId] ?? 0;
  if (r.guaranteeAfter != null && fails >= r.guaranteeAfter) return 1;
  return Math.min(1, Math.max(0, r.baseRate + (r.failBonus ?? 0) * fails));
}

/**
 * 1種類について加入判定する。
 * @returns {{ monsterId: string, chance: number, success: boolean, grant?: any } | null}
 */
export function tryRecruit(save, data, monsterId, level, rng) {
  const def = data.get('monsters', monsterId);
  if (!def.recruit || def.recruit.special) return null;
  const chance = recruitChance(save, data, monsterId);
  const success = rng.next() < chance;
  if (success) {
    save.recruit.failCounts[monsterId] = 0;
    const grant = grantUnit(save, data, monsterId, { level: def.recruit.level ?? level, rank: def.initialRank ?? 1 });
    return { monsterId, chance, success, grant };
  }
  save.recruit.failCounts[monsterId] = (save.recruit.failCounts[monsterId] ?? 0) + 1;
  return { monsterId, chance, success };
}

/**
 * 戦闘で倒した敵の加入判定。種類ごとに1回（同じ種類が複数いたら一番高いレベルで判定）。
 * 1戦闘で加入するのは balance.recruit.maxPerBattle 体まで。
 */
export function recruitAfterBattle(save, data, defeated, rng) {
  const bySpecies = new Map();
  for (const e of defeated) bySpecies.set(e.defId, Math.max(bySpecies.get(e.defId) ?? 0, e.level));
  const max = data.balance.recruit.maxPerBattle;
  const results = [];
  let joined = 0;
  for (const [monsterId, level] of bySpecies) {
    if (joined >= max) break;
    const r = tryRecruit(save, data, monsterId, level, rng);
    if (!r) continue;
    results.push(r);
    if (r.success) joined += 1;
  }
  return results;
}
