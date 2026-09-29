import { h } from '../dom.js';
import { sectionTitle, emptyState } from '../components.js';
import { listAdventureDestinations, selectAdventure } from '../../exploration/map.js';

function uniqueNames(values) {
  return [...new Set(values)].join('、');
}

function destinationInfo(data, loc) {
  const encounter = data.find('encounters', loc.encounterTableId);
  const monsterIds = [...new Set((encounter?.entries ?? []).flatMap((entry) => entry.enemies ?? []).map((enemy) => enemy.defId))];
  const monsterNames = uniqueNames(monsterIds.map((id) => data.find('monsters', id)?.name).filter(Boolean));
  const dropIds = [
    ...(loc.gathering ?? []).map((entry) => entry.itemId),
    ...monsterIds.flatMap((id) => data.find('monsters', id)?.drops?.map((drop) => drop.itemId) ?? []),
  ];
  const dropNames = uniqueNames(dropIds.map((id) => data.find('items', id)?.name).filter(Boolean));
  const strongNames = uniqueNames((loc.optionalEncounters ?? []).map((entry) => entry.name));
  const costs = (loc.actions ?? []).map((id) => data.balance.exploration.actions[id]?.ap).filter(Number.isFinite);
  return {
    monsters: monsterNames || '出現情報なし',
    drops: dropNames || '探索で確認',
    strong: strongNames || 'なし',
    stamina: costs.length ? `${Math.min(...costs)}～${Math.max(...costs)}` : '―',
  };
}

export default {
  nav: 'adventure',
  render(ctx) {
    const { data, save } = ctx;
    if (save.exploration.pendingEvent) {
      return h('section', { class: 'adventure-screen' },
        sectionTitle('探索結果を確認してください'),
        h('p', { class: 'notice' }, '未解決の出来事があります。結果を確認してから冒険先を変更できます。'),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => ctx.go('location', { locationId: save.exploration.pendingEvent.nodeId }, { reset: true }) }, '探索結果へ戻る'),
      );
    }
    const worlds = data.list('worlds').map((world) => {
      const destinations = listAdventureDestinations(save, data, world.id);
      const rows = destinations.map((entry) => {
        const info = destinationInfo(data, entry.node);
        const choose = () => {
          if (!ctx.act(() => selectAdventure(save, data, entry.id))) return;
          ctx.go('location', { locationId: entry.id }, { reset: true });
        };
        return h(
          'button',
          { type: 'button', class: `travel-row adventure-row${entry.locked ? ' locked' : ''}`, disabled: entry.locked, onClick: choose },
          h('span', { class: 'travel-body' },
            h('span', { class: 'travel-name' }, entry.node.name, entry.visited ? null : h('span', { class: 'new-badge' }, 'NEW')),
            h('span', { class: 'travel-meta' }, `敵：${info.monsters}`),
            h('span', { class: 'travel-meta' }, `採取・宝：${info.drops}`),
            h('span', { class: 'travel-meta' }, `強敵：${info.strong}　必要スタミナ：${info.stamina}`),
            entry.locked ? h('span', { class: 'travel-hint' }, entry.hint ?? 'まだ解放されていない') : null,
          ),
        );
      });
      return h('section', { class: 'adventure-world' }, h('h2', { class: 'sub-title' }, world.name), rows.length ? h('div', { class: 'list' }, rows) : emptyState('冒険先はまだありません。'));
    });

    return h(
      'section',
      { class: 'adventure-screen' },
      sectionTitle('冒険先を選ぶ', '選択・変更だけではスタミナも時間も消費しません'),
      h('p', { class: 'help' }, '世界と冒険先を選び、そこで「探索する」などの行動を実行します。'),
      ...worlds,
    );
  },
};
