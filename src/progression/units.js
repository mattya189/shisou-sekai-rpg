/**
 * ユニット（人間キャラクター・モンスター）の入手と一覧。
 *
 * 所持ユニットのキーはユニット定義ID。同じ種類は1体だけ所有する。
 * すでに持っている種類を再入手したら、定義の duplicateTo に従って素材へ変換する。
 */
import { GameError } from '../core/errors.js';
import { createUnitDefaults } from '../save/saveSchema.js';
import { autoFillSkills } from './skillLoadout.js';
import { addItem } from './inventory.js';
import { markMonster } from './codex.js';

export function createUnitState(data, defId, { level = 1, rank } = {}) {
  const { kind, def } = data.getUnitDef(defId);
  const cap = data.balance.levelCap;
  const unit = {
    ...createUnitDefaults(),
    defId,
    kind,
    level: Math.min(Math.max(1, level), cap),
    rank: rank ?? def.initialRank ?? 1,
    equipment: Array(data.balance.equipment.slots).fill(null),
  };
  autoFillSkills(data, unit);
  return unit;
}

/**
 * @returns {{ status: 'added', unitId: string } | { status: 'duplicate', unitId: string, converted: { itemId: string, qty: number }[] }}
 */
export function grantUnit(save, data, defId, opts = {}) {
  const found = data.findUnitDef(defId);
  if (!found) throw new GameError('unknown_unit', `ユニット定義 ${defId} は存在しません`);
  if (found.kind === 'monster') {
    markMonster(save, defId, 'encountered');
    markMonster(save, defId, 'recruited');
  }
  if (save.units[defId]) {
    const converted = found.kind === 'monster' ? found.def.recruit?.duplicateTo ?? [] : found.def.duplicateTo ?? [];
    for (const c of converted) addItem(save, data, c.itemId, c.qty, 'q1', defId);
    return { status: 'duplicate', unitId: defId, converted };
  }
  save.units[defId] = createUnitState(data, defId, opts);
  return { status: 'added', unitId: defId };
}

/**
 * 所持ユニットの一覧。データから消えたユニット（孤児）は除外する。
 * @param {'character' | 'monster'} [kind]
 */
export function listOwnedUnits(save, data, kind) {
  const out = [];
  for (const [unitId, unit] of Object.entries(save.units)) {
    const found = data.findUnitDef(unit.defId);
    if (!found) continue;
    if (kind && found.kind !== kind) continue;
    out.push({ unitId, unit, def: found.def, kind: found.kind });
  }
  return out;
}

export function getOwnedUnit(save, unitId) {
  const unit = save.units[unitId];
  if (!unit) throw new GameError('unit_not_owned', `ユニット ${unitId} を所持していません`);
  return unit;
}
