/**
 * ランクアップ。費用は balance.ranks[].cost（上げた後のランクの cost を使う）。
 * 低いランクほど軽い素材で上がるように設定する。
 */
import { GameError } from '../core/errors.js';
import { getOwnedUnit } from './units.js';
import { countItem, removeItem, spendCurrency, getCurrency } from './inventory.js';
import { autoFillSkills } from './skillLoadout.js';

/** 次のランクと費用。最大ランクなら null */
export function nextRankCost(save, data, unitId) {
  const unit = getOwnedUnit(save, unitId);
  const next = data.balance.ranks.find((r) => r.rank === unit.rank + 1);
  if (!next) return null;
  const items = (next.cost?.items ?? []).map((c) => ({ ...c, have: countItem(save, c.itemId) }));
  const gold = next.cost?.gold ?? 0;
  const haveGold = getCurrency(save, data.balance.goldCurrencyId);
  return { rank: next.rank, multiplier: next.statMultiplier, gold, haveGold, items, canPay: haveGold >= gold && items.every((i) => i.have >= i.qty) };
}

export function rankUp(save, data, unitId) {
  const cost = nextRankCost(save, data, unitId);
  if (!cost) throw new GameError('max_rank', 'これ以上ランクを上げられません');
  if (!cost.canPay) throw new GameError('not_enough_materials', 'ランクアップの素材かお金が足りません');
  for (const c of cost.items) removeItem(save, data, c.itemId, c.qty);
  if (cost.gold) spendCurrency(save, data, data.balance.goldCurrencyId, cost.gold);
  save.units[unitId].rank = cost.rank;
  autoFillSkills(data, save.units[unitId]);
  return cost.rank;
}
