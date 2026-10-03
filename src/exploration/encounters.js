/**
 * エンカウントテーブルから敵の組み合わせを抽選する。
 * 条件（when）を満たす行だけを重み付きで抽選し、レベルは [最小, 最大] から抽選。
 */
import { matchesWhen } from './when.js';

/** @returns {{ defId: string, level: number }[] | null} 候補がなければ null */
export function rollEncounter(data, tableId, situation, rng) {
  const table = data.get('encounters', tableId);
  const candidates = table.entries.filter((e) => matchesWhen(e.when, situation));
  const picked = rng.weighted(candidates);
  if (!picked) return null;
  return picked.enemies.map((en) => ({ defId: en.defId, level: rng.int(en.level[0], en.level[1]), ...(en.rank != null ? { rank: en.rank } : {}) }));
}

/** 今の状況で出現しうるモンスター（図鑑・デバッグ用） */
export function possibleMonsters(data, tableId, situation) {
  const table = data.get('encounters', tableId);
  const ids = new Set();
  for (const e of table.entries) if (matchesWhen(e.when, situation)) for (const en of e.enemies) ids.add(en.defId);
  return [...ids];
}
