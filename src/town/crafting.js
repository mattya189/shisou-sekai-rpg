/**
 * 工房での製作（recipes.json）。
 * 素材に minQuality があると、その品質以上のものだけを使う（低い品質から順に消費）。
 * 出力: output.equipmentId（装備1個）または output.itemId（アイテム、品質は普通）。
 */
import { GameError } from '../core/errors.js';
import { countItem, removeItem, addItem, spendCurrency, getCurrency } from '../progression/inventory.js';
import { grantEquipment } from '../progression/equipment.js';

function usableQualities(data, item, minQuality) {
  const ids = data.qualityIds();
  if (!item.hasQuality) return ['q1'];
  return ids.slice(minQuality ? ids.indexOf(minQuality) : 0);
}

/** 素材ごとの必要数と所持数 */
export function recipeStatus(save, data, recipeId) {
  const recipe = data.get('recipes', recipeId);
  const inputs = recipe.inputs.map((inp) => {
    const item = data.get('items', inp.itemId);
    const have = usableQualities(data, item, inp.minQuality).reduce((a, q) => a + countItem(save, inp.itemId, q), 0);
    return { ...inp, item, have, enough: have >= inp.qty };
  });
  const goldOk = getCurrency(save, data.balance.goldCurrencyId) >= (recipe.gold ?? 0);
  return { recipe, inputs, goldOk, canCraft: goldOk && inputs.every((i) => i.enough) };
}

export function craft(save, data, recipeId, rng) {
  const st = recipeStatus(save, data, recipeId);
  if (!st.canCraft) throw new GameError('not_enough_materials', '素材かお金が足りません');
  const { recipe } = st;
  if (recipe.gold) spendCurrency(save, data, data.balance.goldCurrencyId, recipe.gold);
  for (const inp of st.inputs) {
    let rest = inp.qty;
    for (const q of usableQualities(data, inp.item, inp.minQuality)) {
      const take = Math.min(rest, countItem(save, inp.itemId, q));
      if (take > 0) removeItem(save, data, inp.itemId, take, q);
      rest -= take;
      if (rest === 0) break;
    }
  }
  if (recipe.output.equipmentId) return { equipment: grantEquipment(save, data, recipe.output.equipmentId, rng) };
  addItem(save, data, recipe.output.itemId, recipe.output.qty ?? 1, 'q1', recipeId);
  return { itemId: recipe.output.itemId, qty: recipe.output.qty ?? 1 };
}
