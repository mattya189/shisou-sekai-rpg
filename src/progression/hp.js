/**
 * フィールドでの現在HP。戦闘後もHPは持ち越し、宿屋で回復する（MPは戦闘後に全回復）。
 * unit.currentHp が null なら満タン。最大HPはレベル・装備で変わるので、読むときに上限で切り詰める。
 */
import { unitStats } from './stats.js';
import { getOwnedUnit } from './units.js';
import { partyMembers } from './party.js';

export function currentHp(save, data, unitId) {
  const unit = getOwnedUnit(save, unitId);
  const max = unitStats(save, data, unitId).hp;
  return unit.currentHp == null ? max : Math.min(max, Math.max(0, unit.currentHp));
}

export function setCurrentHp(save, data, unitId, hp) {
  const unit = getOwnedUnit(save, unitId);
  const max = unitStats(save, data, unitId).hp;
  const v = Math.max(0, Math.floor(hp));
  unit.currentHp = v >= max ? null : v;
}

/** 回復して、実際に回復した量を返す（HP0からでも回復できる） */
export function healUnit(save, data, unitId, amount) {
  const before = currentHp(save, data, unitId);
  const max = unitStats(save, data, unitId).hp;
  const after = Math.min(max, before + Math.max(0, Math.floor(amount)));
  setCurrentHp(save, data, unitId, after);
  return after - before;
}

export function healAllUnits(save) {
  for (const unit of Object.values(save.units)) unit.currentHp = null;
}

/** 編成中でHPが残っているユニット */
export function aliveMembers(save, data) {
  return partyMembers(save).filter((id) => data.findUnitDef(save.units[id].defId) && currentHp(save, data, id) > 0);
}
