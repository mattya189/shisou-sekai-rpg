/**
 * 図鑑の一覧（モンスター / アイテム）。
 */
import { h } from '../dom.js';
import { sectionTitle } from '../components.js';
import { unitImageSrc } from '../placeholder.js';
import { monsterEntry, itemEntry, codexProgress } from '../../codex/codex.js';
import { ITEM_CATEGORY_LABEL } from '../format.js';

const TABS = [
  { id: 'monsters', label: 'モンスター' },
  { id: 'items', label: 'アイテム' },
];

export default {
  nav: 'codex',
  render(ctx, params, state) {
    const { data, save } = ctx;
    state.tab ??= 'monsters';
    const pr = codexProgress(save, data);

    const tabs = h(
      'div',
      { class: 'chips', role: 'tablist' },
      TABS.map((t) =>
        h('button', { type: 'button', role: 'tab', class: `chip${state.tab === t.id ? ' active' : ''}`, 'aria-selected': String(state.tab === t.id), onClick: () => { state.tab = t.id; ctx.rerender(); } }, t.label),
      ),
    );

    let body;
    if (state.tab === 'monsters') {
      body = h(
        'div',
        { class: 'codex-grid' },
        data.list('monsters').map((m, i) => {
          const e = monsterEntry(save, data, m.id);
          const no = `No.${String(i + 1).padStart(3, '0')}`;
          return h(
            'button',
            { type: 'button', class: `codex-cell${e.known ? '' : ' unknown'}`, onClick: () => ctx.go('monsterEntry', { monsterId: m.id }), 'aria-label': e.known ? `${no} ${m.name}` : `${no} 未発見` },
            e.known ? h('img', { class: 'portrait portrait-md', src: unitImageSrc(m, 'monster'), alt: '' }) : h('span', { class: 'codex-silhouette' }, '？'),
            h('span', { class: 'codex-no' }, no),
            h('span', { class: 'codex-name' }, e.known ? m.name.replace(/^（仮）/, '') : '？？？'),
            h('span', { class: 'codex-pips' }, e.stages.map((s) => h('span', { class: `pip${s.done ? ' on' : ''}` }))),
            e.record?.flags?.recruited ? h('span', { class: 'codex-owned' }, '仲間') : null,
          );
        }),
      );
    } else {
      body = h(
        'ul',
        { class: 'item-list' },
        data.list('items').map((it) => {
          const e = itemEntry(save, data, it.id);
          return h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: `item-row${e.known ? '' : ' unknown'}`, onClick: () => ctx.go('itemEntry', { itemId: it.id }) },
              h('span', { class: 'item-name' }, e.known ? it.name : '？？？'),
              h(
                'span',
                { class: 'item-total' },
                e.known ? ITEM_CATEGORY_LABEL[it.category] : '',
                e.qualities.length ? h('span', { class: 'codex-pips q' }, e.qualities.map((q) => h('span', { class: `pip${q.obtained ? ' on' : ''}` }))) : null,
              ),
            ),
          );
        }),
      );
    }

    return h(
      'section',
      {},
      sectionTitle('図鑑'),
      h(
        'dl',
        { class: 'kv' },
        h('div', {}, h('dt', {}, 'モンスター'), h('dd', {}, `発見 ${pr.monsters.known}/${pr.monsters.total}　仲間 ${pr.monsters.recruited}`)),
        h('div', {}, h('dt', {}, 'アイテム'), h('dd', {}, `${pr.items.known}/${pr.items.total}　品質 ${pr.items.qualities}/${pr.items.qualityTotal}`)),
      ),
      tabs,
      body,
    );
  },
};
