/**
 * 特技のセット（戦闘で使う最大5個）と優先順位。
 *
 * unit.equippedSkills の並び順がそのまま優先順位（先頭が最優先）。
 * 習得済みの特技は「レベルで覚えるもの（learnset）＋ extraSkills」から毎回計算する。
 */
import { GameError } from '../core/errors.js';

function getUnit(save, unitId) {
  const unit = save.units[unitId];
  if (!unit) throw new GameError('unit_not_owned', `ユニット ${unitId} を所持していません`);
  return unit;
}

/** 現在のレベルで習得済みの特技ID（習得順） */
export function learnedSkillIds(data, unit) {
  const { def } = data.getUnitDef(unit.defId);
  const ids = def.learnset.filter((l) => l.level <= unit.level && (l.rank ?? 1) <= unit.rank).map((l) => l.skillId);
  for (const id of unit.extraSkills ?? []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** まだ習得していない特技と習得レベル */
export function upcomingSkills(data, unit) {
  const { def } = data.getUnitDef(unit.defId);
  return def.learnset.filter((l) => l.level > unit.level || (l.rank ?? 1) > unit.rank);
}

export function setEquippedSkills(save, data, unitId, skillIds) {
  const unit = getUnit(save, unitId);
  const max = data.balance.skills.maxEquipped;
  if (skillIds.length > max) throw new GameError('too_many_skills', `セットできる特技は${max}個までです`);
  if (new Set(skillIds).size !== skillIds.length) throw new GameError('duplicate_skill', '同じ特技は重複してセットできません');
  const learned = learnedSkillIds(data, unit);
  for (const id of skillIds) {
    if (!learned.includes(id)) {
      throw new GameError('skill_not_learned', `${data.find('skills', id)?.name ?? id} はまだ習得していません`);
    }
  }
  unit.equippedSkills = [...skillIds];
}

export function equipSkill(save, data, unitId, skillId) {
  const unit = getUnit(save, unitId);
  setEquippedSkills(save, data, unitId, [...unit.equippedSkills, skillId]);
}

export function unequipSkill(save, data, unitId, skillId) {
  const unit = getUnit(save, unitId);
  unit.equippedSkills = unit.equippedSkills.filter((id) => id !== skillId);
}

/** 優先順位の並べ替え（from の位置の特技を to の位置へ） */
export function moveSkill(save, unitId, from, to) {
  const unit = getUnit(save, unitId);
  const list = unit.equippedSkills;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
    throw new GameError('invalid_index', '並べ替えの位置が不正です');
  }
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
}

/** 空き枠があれば、習得済みでまだセットしていない特技を習得順に詰める */
export function autoFillSkills(data, unit) {
  const max = data.balance.skills.maxEquipped;
  for (const id of learnedSkillIds(data, unit)) {
    if (unit.equippedSkills.length >= max) break;
    if (!unit.equippedSkills.includes(id)) unit.equippedSkills.push(id);
  }
}
