/**
 * アイテム・通貨の所持管理。
 *
 * アイテムは品質別に数量を持つ: save.inventory.items.item_001 = { q1: 32, q2: 18 }
 * 品質のないアイテム（hasQuality: false）は常に q1 に入れる。
 * 通常アイテムに所持上限はない。
 */
import { GameError } from '../core/errors.js';
import { recordItem } from './codex.js';

function assertQty(qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new GameError('invalid_qty', `数量が不正です: ${qty}`);
}

function resolveQuality(data, item, quality) {
  if (!item.hasQuality) return 'q1';
  const q = quality ?? 'q1';
  if (!data.qualityIds().includes(q)) throw new GameError('invalid_quality', `品質 ${q} は存在しません`);
  return q;
}

/** source: 入手元のID（図鑑の入手場所記録用、任意） */
export function addItem(save, data, itemId, qty, quality, source) {
  assertQty(qty);
  const item = data.get('items', itemId);
  const q = resolveQuality(data, item, quality);
  const bucket = (save.inventory.items[itemId] ??= {});
  bucket[q] = (bucket[q] ?? 0) + qty;
  recordItem(save, itemId, q, source);
  return bucket[q];
}

export function removeItem(save, data, itemId, qty, quality) {
  assertQty(qty);
  const item = data.get('items', itemId);
  const q = resolveQuality(data, item, quality);
  const have = save.inventory.items[itemId]?.[q] ?? 0;
  if (have < qty) {
    throw new GameError('not_enough_items', `${item.name}（${data.qualityName(q)}）が足りません（${have}/${qty}）`);
  }
  save.inventory.items[itemId][q] = have - qty;
  if (save.inventory.items[itemId][q] === 0) delete save.inventory.items[itemId][q];
  if (Object.keys(save.inventory.items[itemId]).length === 0) delete save.inventory.items[itemId];
}

/** quality を省略すると全品質の合計 */
export function countItem(save, itemId, quality) {
  const bucket = save.inventory.items[itemId];
  if (!bucket) return 0;
  if (quality) return bucket[quality] ?? 0;
  return Object.values(bucket).reduce((a, b) => a + b, 0);
}

/**
 * 画面表示用のまとめ。
 * @returns {{ item: any, total: number, byQuality: { id: string, name: string, count: number }[] }}
 */
export function summarizeItem(save, data, itemId) {
  const item = data.get('items', itemId);
  const byQuality = data.balance.qualities
    .map((q) => ({ id: q.id, name: q.name, count: countItem(save, itemId, q.id) }))
    .filter((q) => q.count > 0);
  return { item, total: countItem(save, itemId), byQuality };
}

/** 所持しているアイテムの一覧（データの並び順） */
export function listOwnedItems(save, data, category) {
  return data
    .list('items')
    .filter((it) => (!category || it.category === category) && countItem(save, it.id) > 0)
    .map((it) => summarizeItem(save, data, it.id));
}

export function addCurrency(save, data, currencyId, qty) {
  assertQty(qty);
  data.get('currencies', currencyId);
  save.inventory.currencies[currencyId] = (save.inventory.currencies[currencyId] ?? 0) + qty;
  return save.inventory.currencies[currencyId];
}

export function spendCurrency(save, data, currencyId, qty) {
  assertQty(qty);
  const cur = data.get('currencies', currencyId);
  const have = save.inventory.currencies[currencyId] ?? 0;
  if (have < qty) throw new GameError('not_enough_currency', `${cur.name}が足りません（${have}/${qty}）`);
  save.inventory.currencies[currencyId] = have - qty;
}

export function getCurrency(save, currencyId) {
  return save.inventory.currencies[currencyId] ?? 0;
}
