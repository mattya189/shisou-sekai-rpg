/**
 * パーティ編成。4枠に人間キャラクターとモンスターを自由に混ぜられる。
 * save.party はユニットIDまたは null の配列。
 */
import { GameError } from '../core/errors.js';

export function setPartySlot(save, data, slot, unitId) {
  const size = data.balance.party.size;
  if (!Number.isInteger(slot) || slot < 0 || slot >= size) throw new GameError('invalid_slot', 'パーティの枠が不正です');
  const party = save.party;
  while (party.length < size) party.push(null);

  if (unitId === null) {
    const remaining = party.filter((id, i) => id !== null && i !== slot).length;
    if (remaining === 0) throw new GameError('party_empty', 'パーティには最低1体が必要です');
    party[slot] = null;
    return;
  }
  if (!save.units[unitId]) throw new GameError('unit_not_owned', 'そのユニットは所持していません');

  const currentIndex = party.indexOf(unitId);
  if (currentIndex === slot) return;
  if (currentIndex >= 0) {
    // すでに別の枠にいる → 入れ替え
    party[currentIndex] = party[slot];
  }
  party[slot] = unitId;
}

/** 編成中のユニットID（空き枠を除く、枠順） */
export function partyMembers(save) {
  return save.party.filter((id) => id !== null && save.units[id]);
}

export function partySlotOf(save, unitId) {
  const i = save.party.indexOf(unitId);
  return i >= 0 ? i : null;
}
