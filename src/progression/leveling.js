/**
 * レベルと経験値、ランク。
 * 数値は data/balance.json の exp / levelCap / ranks で調整する。
 */
import { GameError } from '../core/errors.js';
import { getOwnedUnit } from './units.js';
import { autoFillSkills, learnedSkillIds } from './skillLoadout.js';

/** 次のレベルまでに必要な経験値。上限レベルでは0。 */
export function expToNext(level, balance) {
  if (level >= balance.levelCap) return 0;
  return Math.floor(balance.exp.base * Math.pow(level, balance.exp.exponent));
}

/**
 * @returns {{ levelsGained: number, learned: string[] }}
 */
export function addExp(save, data, unitId, amount) {
  const unit = getOwnedUnit(save, unitId);
  const before = learnedSkillIds(data, unit);
  const startLevel = unit.level;
  const cap = data.balance.levelCap;
  if (unit.level >= cap) return { levelsGained: 0, learned: [] };
  unit.exp += Math.max(0, Math.floor(amount));
  while (unit.level < cap && unit.exp >= expToNext(unit.level, data.balance)) {
    unit.exp -= expToNext(unit.level, data.balance);
    unit.level += 1;
  }
  if (unit.level >= cap) unit.exp = 0;
  const learned = learnedSkillIds(data, unit).filter((id) => !before.includes(id));
  autoFillSkills(data, unit);
  return { levelsGained: unit.level - startLevel, learned };
}

export function setLevel(save, data, unitId, level) {
  const unit = getOwnedUnit(save, unitId);
  unit.level = Math.min(Math.max(1, Math.floor(level)), data.balance.levelCap);
  unit.exp = 0;
  const learned = learnedSkillIds(data, unit);
  unit.equippedSkills = unit.equippedSkills.filter((id) => learned.includes(id));
  autoFillSkills(data, unit);
}

export function maxRank(balance) {
  return balance.ranks[balance.ranks.length - 1].rank;
}

export function setRank(save, data, unitId, rank) {
  const unit = getOwnedUnit(save, unitId);
  const r = Math.floor(rank);
  if (!data.balance.ranks.some((x) => x.rank === r)) {
    throw new GameError('invalid_rank', `ランク${r}は存在しません（1〜${maxRank(data.balance)}）`);
  }
  unit.rank = r;
}
