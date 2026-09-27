/**
 * ショップ（shops.json）。買い物・売却。
 *   売値 = アイテムの price × ショップの sellRate × 品質の倍率（effectMultiplier）
 *   装備の売値 = 装備の price × sellRate × (1 + 強化値 × 0.1)
 * price の無いアイテム・重要アイテム・装備中の装備は売れない。
 */
import { GameError } from '../core/errors.js';
import { addItem, removeItem, countItem, addCurrency, spendCurrency } from '../progression/inventory.js';
import { grantEquipment, findEquipmentOwner } from '../progression/equipment.js';
import { qualityMultiplier } from '../progression/quality.js';
import { matchesWhen } from '../exploration/when.js';

function gold(data) {
  return data.balance.goldCurrencyId;
}

/** 今買える商品（when を満たすもの） */
export function shopStock(save, data, shopId) {
  const shop = data.get('shops', shopId);
  const sit = { period: save.exploration.time.period, weatherId: null, flags: save.flags };
  return {
    items: (shop.items ?? []).map((e, index) => ({ ...e, index, quality: e.quality ?? 'q1' })).filter((e) => matchesWhen(e.when, sit)),
    equipment: (shop.equipment ?? []).map((e, index) => ({ ...e, index })).filter((e) => matchesWhen(e.when, sit)),
  };
}

export function buyItem(save, data, shopId, index, qty = 1) {
  const entry = shopStock(save, data, shopId).items.find((e) => e.index === index);
  if (!entry) throw new GameError('not_for_sale', 'その商品は売っていません');
  if (!Number.isInteger(qty) || qty <= 0) throw new GameError('invalid_qty', '数量が不正です');
  spendCurrency(save, data, gold(data), entry.price * qty);
  addItem(save, data, entry.itemId, qty, entry.quality, shopId);
  return { itemId: entry.itemId, quality: entry.quality, qty, cost: entry.price * qty };
}

export function buyEquipment(save, data, shopId, index, rng) {
  const entry = shopStock(save, data, shopId).equipment.find((e) => e.index === index);
  if (!entry) throw new GameError('not_for_sale', 'その商品は売っていません');
  spendCurrency(save, data, gold(data), entry.price);
  return grantEquipment(save, data, entry.defId, rng);
}

export function itemSellPrice(data, shopId, itemId, quality) {
  const item = data.get('items', itemId);
  if (item.category === 'key' || !item.price) return 0;
  const rate = data.get('shops', shopId).sellRate ?? 0.5;
  return Math.max(1, Math.floor(item.price * rate * (item.hasQuality ? qualityMultiplier(data, quality) : 1)));
}

export function sellItem(save, data, shopId, itemId, quality, qty = 1) {
  const price = itemSellPrice(data, shopId, itemId, quality);
  if (price <= 0) throw new GameError('not_sellable', `${data.get('items', itemId).name}は売れません`);
  if (countItem(save, itemId, quality) < qty) throw new GameError('not_enough_items', '数が足りません');
  removeItem(save, data, itemId, qty, quality);
  addCurrency(save, data, gold(data), price * qty);
  return { gained: price * qty };
}

export function equipmentSellPrice(save, data, shopId, uid) {
  const inst = save.inventory.equipment[uid];
  const def = data.get('equipment', inst.defId);
  const rate = data.get('shops', shopId).sellRate ?? 0.5;
  return Math.max(1, Math.floor((def.price ?? 0) * rate * (1 + (inst.plus ?? 0) * 0.1)));
}

export function sellEquipment(save, data, shopId, uid) {
  if (!save.inventory.equipment[uid]) throw new GameError('equipment_not_owned', 'その装備は持っていません');
  if (findEquipmentOwner(save, uid)) throw new GameError('equipped', '装備中の装備は売れません。先に外してください');
  const price = equipmentSellPrice(save, data, shopId, uid);
  delete save.inventory.equipment[uid];
  addCurrency(save, data, gold(data), price);
  return { gained: price };
}
