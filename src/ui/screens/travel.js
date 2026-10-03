import { h } from '../dom.js';
import { sectionTitle, emptyState } from '../components.js';
import { listAdventureDestinations, listWorldZones, selectAdventure, selectZone } from '../../exploration/map.js';

function uniqueNames(values) { return [...new Set(values)].join('、'); }

function destinationInfo(data, loc) {
  const encounter = data.find('encounters', loc.encounterTableId);
  const monsterIds = [...new Set((encounter?.entries ?? []).flatMap((entry) => entry.enemies ?? []).map((enemy) => enemy.defId))];
  const monsterNames = uniqueNames(monsterIds.map((id) => data.find('monsters', id)?.name).filter(Boolean));
  const dropIds = [...(loc.gathering ?? []).map((entry) => entry.itemId), ...monsterIds.flatMap((id) => data.find('monsters', id)?.drops?.map((drop) => drop.itemId) ?? [])];
  const costs = (loc.actions ?? []).map((id) => data.balance.exploration.actions[id]?.ap).filter(Number.isFinite);
  return {
    monsters: monsterNames || '出現情報なし',
    drops: uniqueNames(dropIds.map((id) => data.find('items', id)?.name).filter(Boolean)) || '探索で確認',
    strong: uniqueNames((loc.optionalEncounters ?? []).map((entry) => entry.name)) || 'なし',
    stamina: costs.length ? `${Math.min(...costs)}～${Math.max(...costs)}` : '―',
  };
}

function worldList(ctx) {
  const rows = ctx.data.list('worlds').map((world) => h('button', {
    type: 'button', class: 'travel-row world-row', onClick: () => ctx.go('travel', { worldId: world.id }, { replace: true }),
  }, h('span', { class: 'travel-body' },
    h('span', { class: 'travel-name' }, world.name),
    h('span', { class: 'travel-meta' }, world.theme),
    h('span', { class: 'travel-hint' }, '5段階の地帯から挑戦先を選択'),
  )));
  return h('section', { class: 'adventure-screen' }, sectionTitle('思想世界を選ぶ'),
    h('p', { class: 'help' }, '1つの思想世界が、1つの大きな環境・テーマとして成立しています。'), h('div', { class: 'list' }, rows));
}

function zoneList(ctx, world) {
  const { data, save } = ctx;
  const rows = listWorldZones(save, data, world.id).map((entry) => h('button', {
    type: 'button', class: `travel-row zone-row zone-tier-${entry.zone.tier}${entry.locked ? ' locked' : ''}`, disabled: entry.locked,
    onClick: () => {
      if (!ctx.act(() => selectZone(save, data, world.id, entry.id))) return;
      ctx.go('travel', { worldId: world.id, zoneId: entry.id }, { replace: true });
    },
  }, h('span', { class: 'zone-tier' }, String(entry.zone.tier)), h('span', { class: 'travel-body' },
    h('span', { class: 'travel-name' }, entry.zone.name, entry.locked ? h('span', { class: 'lock-badge' }, '未解放') : null),
    h('span', { class: 'travel-meta' }, entry.zone.description),
    entry.locked ? h('span', { class: 'travel-hint' }, entry.hint ?? '未解放') : null,
  )));
  return h('section', { class: 'adventure-screen' },
    h('button', { type: 'button', class: 'back-link', onClick: () => ctx.go('travel', {}, { replace: true }) }, '思想世界一覧へ'),
    sectionTitle(world.name, '挑戦する地帯を選択'), world.description ? h('p', { class: 'help' }, world.description) : null,
    h('div', { class: 'zone-list' }, rows));
}

function destinationList(ctx, world, zone) {
  const { data, save } = ctx;
  const rows = listAdventureDestinations(save, data, world.id, zone.id).map((entry) => {
    const info = destinationInfo(data, entry.node);
    return h('button', { type: 'button', class: `travel-row adventure-row${entry.locked ? ' locked' : ''}`, disabled: entry.locked, onClick: () => {
      if (!ctx.act(() => selectAdventure(save, data, entry.id))) return;
      ctx.go('location', { locationId: entry.id }, { reset: true });
    } }, h('span', { class: 'travel-body' },
      h('span', { class: 'travel-name' }, entry.node.name, entry.visited ? null : h('span', { class: 'new-badge' }, 'NEW')),
      h('span', { class: 'travel-meta' }, `敵：${info.monsters}`), h('span', { class: 'travel-meta' }, `採取・宝：${info.drops}`),
      h('span', { class: 'travel-meta' }, `強敵：${info.strong}　必要スタミナ：${info.stamina}`),
      entry.locked ? h('span', { class: 'travel-hint' }, entry.hint ?? 'まだ解放されていない') : null));
  });
  return h('section', { class: 'adventure-screen' },
    h('button', { type: 'button', class: 'back-link', onClick: () => ctx.go('travel', { worldId: world.id }, { replace: true }) }, `${world.name}の地帯一覧へ`),
    sectionTitle(zone.name, '選択だけではスタミナも時間も消費しません'), h('p', { class: 'help' }, zone.description),
    rows.length ? h('div', { class: 'list' }, rows) : emptyState('この地帯の冒険先は今後追加されます。'));
}

export default {
  nav: 'adventure',
  render(ctx, params) {
    const { data, save } = ctx;
    if (save.exploration.pendingEvent) return h('section', { class: 'adventure-screen' }, sectionTitle('探索結果を確認してください'),
      h('p', { class: 'notice' }, '未解決の出来事があります。結果を確認してから冒険先を変更できます。'),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => ctx.go('location', { locationId: save.exploration.pendingEvent.nodeId }, { reset: true }) }, '探索結果へ戻る'));
    if (!params.worldId) return worldList(ctx);
    const world = data.find('worlds', params.worldId);
    if (!world) return worldList(ctx);
    if (!params.zoneId) return zoneList(ctx, world);
    const zone = data.find('zones', params.zoneId);
    return !zone || zone.worldId !== world.id ? zoneList(ctx, world) : destinationList(ctx, world, zone);
  },
};
