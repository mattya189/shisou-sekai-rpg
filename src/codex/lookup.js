/**
 * データからの逆引き（図鑑用）。セーブには依存しない。
 */

/** モンスターが出現する場所（エンカウントテーブル → 地点・ダンジョン）と条件 */
export function monsterHabitats(data, monsterId) {
  const tablesWith = new Map();
  for (const t of data.list('encounters')) {
    const whens = t.entries.filter((e) => e.enemies.some((en) => en.defId === monsterId)).map((e) => e.when ?? null);
    if (whens.length) tablesWith.set(t.id, whens);
  }
  const out = [];
  for (const loc of data.list('locations')) {
    if (tablesWith.has(loc.encounterTableId)) out.push({ kind: 'location', nodeId: loc.id, whens: tablesWith.get(loc.encounterTableId) });
  }
  for (const d of data.list('dungeons')) {
    for (const st of d.stages) {
      if (tablesWith.has(st.encounterTableId) && !out.some((o) => o.dungeonId === d.id)) {
        out.push({ kind: 'dungeon', dungeonId: d.id, nodeId: d.entranceNodeId, whens: tablesWith.get(st.encounterTableId) });
      }
      if (st.bossId && data.get('bosses', st.bossId).monsterId === monsterId) {
        out.push({ kind: 'boss', dungeonId: d.id, nodeId: d.entranceNodeId, bossId: st.bossId, whens: [null] });
      }
    }
  }
  return out;
}

/**
 * アイテムの入手方法の一覧。
 * @returns {{ kind: string, sourceId: string, nodeId?: string, when?: any, rate?: number, detail?: string }[]}
 *   kind: gather（採取）/ secret（隠し要素）/ drop（ドロップ）/ boss（ボス報酬）/ shop（ショップ）/
 *         recipe（製作）/ event（イベント）/ duplicate（仲間の重複変換）
 *   sourceId はセーブの codex.items[].sources に記録されるIDと同じ
 */
export function itemSources(data, itemId) {
  const out = [];
  for (const loc of data.list('locations')) {
    for (const g of loc.gathering ?? []) if (g.itemId === itemId) out.push({ kind: 'gather', sourceId: loc.id, nodeId: loc.id, when: g.when ?? null });
    for (const sc of loc.secrets ?? []) {
      if ((sc.rewards?.items ?? []).some((it) => it.itemId === itemId)) out.push({ kind: 'secret', sourceId: loc.id, nodeId: loc.id });
    }
  }
  for (const m of data.list('monsters')) {
    for (const d of m.drops ?? []) if (d.itemId === itemId) out.push({ kind: 'drop', sourceId: m.id, monsterId: m.id, rate: d.rate });
    for (const c of m.recruit?.duplicateTo ?? []) if (c.itemId === itemId) out.push({ kind: 'duplicate', sourceId: m.id, monsterId: m.id });
  }
  for (const b of data.list('bosses')) {
    if ((b.rewards?.items ?? []).some((it) => it.itemId === itemId)) out.push({ kind: 'boss', sourceId: b.id, monsterId: b.monsterId });
  }
  for (const s of data.list('shops')) {
    if ((s.items ?? []).some((it) => it.itemId === itemId)) out.push({ kind: 'shop', sourceId: s.id });
  }
  for (const r of data.list('recipes')) if (r.output.itemId === itemId) out.push({ kind: 'recipe', sourceId: r.id });
  for (const ev of data.list('events')) {
    if ((ev.effects ?? []).some((e) => e.type === 'giveItem' && e.itemId === itemId)) out.push({ kind: 'event', sourceId: ev.id, nodeId: ev.nodeId });
  }
  return out;
}
