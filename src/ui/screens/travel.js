import { h } from '../dom.js';
import { sectionTitle, emptyState } from '../components.js';
import { listConnections, moveTo, currentNodeId } from '../../exploration/map.js';
import { periodName } from '../format.js';

export default {
  nav: 'here',
  render(ctx) {
    const { data, save, session } = ctx;
    const here = data.findNode(currentNodeId(save));
    const conns = listConnections(save, data);

    const go = (to) => {
      let moved;
      if (!ctx.act(() => (moved = moveTo(save, data, to, session.rng)))) return;
      const note = moved.periodsPassed > 0 ? `（${periodName(data, save.exploration.time.period)}になった）` : '';
      ctx.toast(`${moved.node.name}に着いた${note}`);
      ctx.go(moved.isTown ? 'town' : 'location', {}, { reset: true });
    };

    const rows = conns.map((c) => {
      const kindLabel = data.has('towns', c.to) ? '街' : c.node.kind === 'dungeonEntrance' ? 'ダンジョン' : 'フィールド';
      const cost = [`移動 ${c.distance}`, c.apCost ? `行動力 ${c.apCost}` : null].filter(Boolean).join('　');
      return h(
        'button',
        { type: 'button', class: `travel-row${c.locked ? ' locked' : ''}`, onClick: () => go(c.to), 'aria-disabled': c.locked ? 'true' : undefined },
        h(
          'span',
          { class: 'travel-body' },
          h('span', { class: 'travel-name' }, c.node.name, c.visited ? null : h('span', { class: 'new-badge' }, '未踏')),
          h('span', { class: 'travel-meta' }, `${kindLabel}　${cost}`),
          c.locked ? h('span', { class: 'travel-hint' }, c.hint ?? 'まだ通れない') : null,
        ),
      );
    });

    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '戻る'),
      sectionTitle('どこへ行く？', `${here?.name ?? ''}から`),
      h('p', { class: 'help' }, '移動では行動力を使いません。距離ぶんだけ時間が進みます。'),
      rows.length ? h('div', { class: 'list' }, rows) : emptyState('ここから行ける場所はありません。'),
    );
  },
};
