/**
 * 装備の強化（+0 → +10）。費用は balance.enhance で調整する。
 *   強化石の数 = itemsPerPlus[現在の強化値]
 *   ゴールド   = goldBase + goldPerPlus × 現在の強化値
 */
import { GameError } from '../core/errors.js';
import { countItem, removeItem, spendCurrency, getCurrency } from './inventory.js';

export function enhanceCost(data, plus) {
  const e = data.balance.enhance;
  return {
    itemId: e.costItemId,
    qty: e.itemsPerPlus[plus] ?? e.itemsPerPlus[e.itemsPerPlus.length - 1],
    gold: e.goldBase + e.goldPerPlus * plus,
  };
}

export function enhanceEquipment(save, data, uid) {
  const inst = save.inventory.equipment[uid];
  if (!inst) throw new GameError('equipment_not_owned', 'その装備は持っていません');
  const max = data.balance.equipment.maxPlus;
  if (inst.plus >= max) throw new GameError('max_plus', `これ以上強化できません（+${max}）`);
  const cost = enhanceCost(data, inst.plus);
  const item = data.get('items', cost.itemId);
  if (countItem(save, cost.itemId) < cost.qty) throw new GameError('not_enough_items', `${item.name}が足りません（${countItem(save, cost.itemId)}/${cost.qty}）`);
  if (getCurrency(save, data.balance.goldCurrencyId) < cost.gold) throw new GameError('not_enough_currency', `ゴールドが足りません（${cost.gold}G）`);
  removeItem(save, data, cost.itemId, cost.qty);
  spendCurrency(save, data, data.balance.goldCurrencyId, cost.gold);
  inst.plus += 1;
  return inst;
}
