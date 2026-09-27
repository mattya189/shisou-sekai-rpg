/**
 * 図鑑の表示内容を決める（DOMに依存しない）。
 *
 * モンスター図鑑: balance.codex.monsterStages の段階を上から確認し、条件を満たした段階の
 *   reveals（basic / habitat / stats / drops / skills / passives / recruit / description）が見えるようになる。
 *   モンスターごとに追加の段階を足したいときは、モンスターデータに codexStages を書く（同じ形式）。
 * アイテム図鑑: 一度でも入手したアイテムが載る。品質ごとの入手状況と入手方法の逆引きを表示する。
 *
 * 段階の条件の種類は CODEX_REQUIREMENTS に登録する。
 */
import { itemSources, monsterHabitats } from './lookup.js';

export const CODEX_REQUIREMENTS = {
  /** 図鑑フラグ（encountered / defeated / recruited など） */
  codexFlag: (r, rec) => Boolean(rec?.flags?.[r.flag]),
  /** 図鑑の回数（defeated など）が min 以上 */
  counter: (r, rec) => (rec?.counts?.[r.counter] ?? 0) >= r.min,
  /** ゲーム全体のフラグ（イベントで情報が開く、など） */
  saveFlag: (r, rec, save) => Boolean(save.flags[r.flag]),
};

export function monsterStages(data, monsterId) {
  const m = data.get('monsters', monsterId);
  return [...data.balance.codex.monsterStages, ...(m.codexStages ?? [])];
}

/**
 * @returns {{ monster: any, known: boolean, stages: { id: string, name: string, done: boolean }[], reveals: Set<string>, record: any }}
 */
export function monsterEntry(save, data, monsterId) {
  const monster = data.get('monsters', monsterId);
  const record = save.codex.monsters[monsterId] ?? null;
  const reveals = new Set();
  const stages = monsterStages(data, monsterId).map((st) => {
    const done = CODEX_REQUIREMENTS[st.requires.type]?.(st.requires, record, save) ?? false;
    if (done) for (const r of st.reveals) reveals.add(r);
    return { id: st.id, name: st.name, done };
  });
  return { monster, known: reveals.has('basic'), stages, reveals, record, habitats: reveals.has('habitat') ? monsterHabitats(data, monsterId) : [] };
}

export function itemEntry(save, data, itemId) {
  const item = data.get('items', itemId);
  const record = save.codex.items[itemId] ?? null;
  const known = Boolean(record);
  const qualities = item.hasQuality
    ? data.balance.qualities.map((q) => ({ id: q.id, name: q.name, obtained: Boolean(record?.qualities?.[q.id]) }))
    : [];
  const sources = known ? itemSources(data, itemId).map((s) => ({ ...s, found: Boolean(record?.sources?.[s.sourceId]) })) : [];
  return { item, known, qualities, sources };
}

/** 図鑑の達成状況 */
export function codexProgress(save, data) {
  const monsters = data.list('monsters');
  const items = data.list('items');
  const knownMonsters = monsters.filter((m) => monsterEntry(save, data, m.id).known).length;
  const recruited = monsters.filter((m) => save.codex.monsters[m.id]?.flags?.recruited).length;
  const knownItems = items.filter((i) => save.codex.items[i.id]).length;
  const qualityTotal = items.filter((i) => i.hasQuality).length * data.balance.qualities.length;
  const qualityGot = items.filter((i) => i.hasQuality).reduce((a, i) => a + Object.keys(save.codex.items[i.id]?.qualities ?? {}).length, 0);
  return {
    monsters: { known: knownMonsters, recruited, total: monsters.length },
    items: { known: knownItems, total: items.length, qualities: qualityGot, qualityTotal },
  };
}
