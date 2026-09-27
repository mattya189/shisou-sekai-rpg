/**
 * 消耗品の使用。items.json の use.type と対応するレジストリ。
 * 効果量には品質の倍率（balance.qualities[].effectMultiplier）がかかる。
 *
 * 新しい使用効果を追加するときは ITEM_USES に1件追加する。
 */
import { GameError } from '../core/errors.js';
import { removeItem, countItem } from './inventory.js';
import { getOwnedUnit } from './units.js';
import { unitStats } from './stats.js';
import { currentHp, healUnit } from './hp.js';
import { qualityMultiplier } from './quality.js';

export const ITEM_USES = {
  healPctOfMaxHp: {
    params: ['pct'],
    /** 使えるか（使えないなら理由） */
    canUse(save, data, unitId) {
      const max = unitStats(save, data, unitId).hp;
      return currentHp(save, data, unitId) < max ? null : 'HPは満タンです';
    },
    apply(save, data, unitId, use, mult) {
      const max = unitStats(save, data, unitId).hp;
      const amount = Math.max(1, Math.floor(((max * use.pct) / 100) * mult));
      return { healed: healUnit(save, data, unitId, amount) };
    },
  },
};

export function useItem(save, data, itemId, quality, unitId) {
  const item = data.get('items', itemId);
  const handler = ITEM_USES[item.use?.type];
  if (item.category !== 'consumable' || !handler) throw new GameError('not_usable', `${item.name}はここでは使えません`);
  getOwnedUnit(save, unitId);
  const q = item.hasQuality ? quality ?? 'q1' : 'q1';
  if (countItem(save, itemId, q) <= 0) throw new GameError('not_enough_items', `${item.name}を持っていません`);
  const reason = handler.canUse(save, data, unitId);
  if (reason) throw new GameError('cannot_use', reason);
  const result = handler.apply(save, data, unitId, item.use, qualityMultiplier(data, q));
  removeItem(save, data, itemId, 1, q);
  return result;
}
