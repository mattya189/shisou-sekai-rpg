/**
 * 新しいゲームのセーブを作る。開始時の所持品などは balance.json の newGame で決める。
 */
import { createEmptySave } from '../save/saveSchema.js';
import { grantUnit } from '../progression/units.js';
import { addItem, addCurrency } from '../progression/inventory.js';
import { grantEquipment, equipToUnit } from '../progression/equipment.js';
import { rollAllWeather } from '../exploration/time.js';

export function createNewGame(data, rng) {
  const b = data.balance;
  const ng = b.newGame;
  const save = createEmptySave();
  save.party = Array(b.party.size).fill(null);
  save.exploration.worldId = ng.worldId;
  save.exploration.townId = ng.townId;
  save.exploration.discoveredNodes = [ng.townId];
  save.exploration.actionPoints = b.actionPoints.initial;
  save.exploration.maxActionPoints = b.actionPoints.initial;
  save.exploration.time = { day: 1, period: b.time.startPeriod, tick: 0 };
  rollAllWeather(save, data, rng);

  for (const u of ng.units) grantUnit(save, data, u.defId, { level: u.level ?? 1 });
  save.party = [...ng.party];
  for (const c of ng.currencies ?? []) addCurrency(save, data, c.currencyId, c.qty);
  for (const it of ng.items ?? []) addItem(save, data, it.itemId, it.qty, it.quality);
  for (const e of ng.equipment ?? []) {
    const inst = grantEquipment(save, data, e.defId, rng);
    if (e.equipTo) equipToUnit(save, data, e.equipTo, e.slot ?? 0, inst.uid);
  }
  return save;
}
