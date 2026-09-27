/**
 * 図鑑の記録。図鑑画面は Phase 8 だが、記録はゲーム開始時から貯めておく。
 *
 * モンスターのフラグ名は自由に追加できる（例: 'sawSkill_skill_004'）。
 * 標準: encountered / defeated / recruited / researched
 */

export function markMonster(save, monsterId, flag, value = true) {
  const rec = (save.codex.monsters[monsterId] ??= { flags: {}, counts: {} });
  rec.flags ??= {};
  rec.flags[flag] = value;
  return rec;
}

export function countMonster(save, monsterId, counter, amount = 1) {
  const rec = (save.codex.monsters[monsterId] ??= { flags: {}, counts: {} });
  rec.counts ??= {};
  rec.counts[counter] = (rec.counts[counter] ?? 0) + amount;
  return rec.counts[counter];
}

export function hasMonsterFlag(save, monsterId, flag) {
  return Boolean(save.codex.monsters[monsterId]?.flags?.[flag]);
}

/**
 * アイテムの入手記録。source には入手元のID（地点 loc_001・モンスター mon_001 など）を渡す。
 * アイテム図鑑の「入手場所の逆引き」に使う。
 */
export function recordItem(save, itemId, qualityId, source) {
  const rec = (save.codex.items[itemId] ??= { qualities: {} });
  rec.qualities ??= {};
  if (qualityId) rec.qualities[qualityId] = true;
  if (source) {
    rec.sources ??= {};
    rec.sources[source] = true;
  }
  return rec;
}
