/**
 * 装備の個体管理。
 * 装備は1つずつ個体（uid）を持ち、ランダム能力と強化値（+0〜+10）は個体ごとに保存する。
 * 装備そのものに品質はない。
 */
import { GameError } from '../core/errors.js';
import { getOwnedUnit } from './units.js';

/** ランダム能力を抽選して装備個体を作り、所持品に加える */
export function grantEquipment(save, data, defId, rng) {
  const def = data.get('equipment', defId);
  const randomStats = [];
  const rs = def.randomStats;
  if (rs && rs.count > 0 && rs.pool?.length) {
    for (let i = 0; i < rs.count; i++) {
      const p = rng.pick(rs.pool);
      randomStats.push({ stat: p.stat, value: rng.int(p.min, p.max) });
    }
  }
  const uid = `eq_${save.nextUid++}`;
  const instance = { uid, defId, plus: 0, randomStats };
  save.inventory.equipment[uid] = instance;
  return instance;
}

/** 装備個体を装備しているユニットID（なければ null） */
export function findEquipmentOwner(save, uid) {
  for (const [unitId, unit] of Object.entries(save.units)) {
    if (unit.equipment.includes(uid)) return unitId;
  }
  return null;
}

/** 装備する。ほかのユニットが装備中なら外してから付け替える。uid に null で外す。 */
export function equipToUnit(save, data, unitId, slot, uid) {
  const unit = getOwnedUnit(save, unitId);
  const slots = data.balance.equipment.slots;
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) throw new GameError('invalid_slot', '装備枠が不正です');
  if (uid !== null) {
    if (!save.inventory.equipment[uid]) throw new GameError('equipment_not_owned', 'その装備は所持していません');
    const owner = findEquipmentOwner(save, uid);
    if (owner) {
      const s = save.units[owner].equipment.indexOf(uid);
      save.units[owner].equipment[s] = null;
    }
  }
  unit.equipment[slot] = uid;
}

export function equipmentInstancesOf(save, unit) {
  return unit.equipment.filter(Boolean).map((uid) => save.inventory.equipment[uid]).filter(Boolean);
}
