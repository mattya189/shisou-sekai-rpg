/**
 * 図鑑の一覧（モンスター / アイテム）。
 */
import { h } from '../dom.js';
import { sectionTitle } from '../components.js';
import { unitImageSrc } from '../placeholder.js';
import { monsterEntry, itemEntry, codexProgress } from '../../codex/codex.js';
import { abilityCatalog, abilityFilterOptions, abilityIsRevealed, filterAbilityCatalog, ABILITY_KIND_LABEL } from '../../codex/abilities.js';
import { ITEM_CATEGORY_LABEL } from '../format.js';

const TABS = [
  { id: 'monsters', label: 'モンスター' },
  { id: 'abilities', label: '特技' },
  { id: 'items', label: 'アイテム' },
];

function selectField(label, value, options, onChange) {
  const select = h(
    'select',
    { onChange: (event) => onChange(event.target.value) },
    options.map((option) => h('option', { value: option.value }, option.label)),
  );
  select.value = value;
  return h('label', { class: 'codex-filter' }, h('span', {}, label), select);
}

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
    } else if (state.tab === 'abilities') {
      state.abilityQuery ??= '';
      state.abilityKind ??= 'all';
      state.abilityElement ??= 'all';
      state.abilityTrigger ??= 'all';
      const catalog = abilityCatalog(data).filter((entry) => abilityIsRevealed(save, data, entry));
      const options = abilityFilterOptions(data, catalog);
      const filtered = filterAbilityCatalog(catalog, {
        query: state.abilityQuery,
        kind: state.abilityKind,
        element: state.abilityElement,
        trigger: state.abilityTrigger,
      });
      const search = h('input', {
        type: 'search',
        class: 'codex-search',
        value: state.abilityQuery,
        placeholder: '特技・パッシブ名を検索',
        'aria-label': '特技・パッシブ名を検索',
        onInput: (event) => {
          state.abilityQuery = event.target.value;
          ctx.rerender();
          queueMicrotask(() => {
            const input = document.querySelector('.codex-search');
            input?.focus();
            input?.setSelectionRange?.(state.abilityQuery.length, state.abilityQuery.length);
          });
        },
      });
      const filters = h(
        'div',
        { class: 'codex-filters' },
        selectField('分類', state.abilityKind, [
          { value: 'all', label: 'すべて' },
          { value: 'skill', label: '特技' },
          { value: 'passive', label: 'パッシブ' },
          { value: 'ultimate', label: '奥義' },
          { value: 'combo', label: 'コンボ' },
        ], (value) => { state.abilityKind = value; ctx.rerender(); }),
        selectField('属性', state.abilityElement, [{ value: 'all', label: 'すべて' }, ...options.elements.map((el) => ({ value: el.id, label: el.name }))], (value) => { state.abilityElement = value; ctx.rerender(); }),
        selectField('条件・効果', state.abilityTrigger, [
          { value: 'all', label: 'すべて' },
          ...options.multiples.map((n) => ({ value: `attack:${n}`, label: `${n}の倍数回` })),
          { value: 'immediate', label: '即時発動' },
          { value: 'status', label: '状態関連' },
          { value: 'marker', label: 'スタック関連' },
        ], (value) => { state.abilityTrigger = value; ctx.rerender(); }),
      );
      body = h(
        'div',
        { class: 'ability-codex' },
        h('p', { class: 'help' }, 'モンスター図鑑で能力情報を解放すると登録されます。条件や倍率は実戦データと共通です。'),
        search,
        filters,
        h('p', { class: 'muted small ability-result-count' }, `${filtered.length}件`),
        filtered.length
          ? h('ul', { class: 'ability-list ability-catalog-list' }, filtered.map((entry) => {
              const knownUsers = entry.users.filter((user) => monsterEntry(save, data, user.monsterId).known);
              return h('li', {}, h(
                'button',
                { type: 'button', class: 'ability-row', onClick: () => ctx.go('abilityEntry', { type: entry.type, abilityId: entry.id }) },
                h('span', { class: `ability-kind ability-kind-${entry.kind}` }, ABILITY_KIND_LABEL[entry.kind]),
                h('span', { class: 'ability-row-body' },
                  h('strong', {}, entry.name),
                  h('span', { class: 'muted small' }, entry.triggerText),
                  knownUsers.length ? h('span', { class: 'ability-users-preview' }, knownUsers.map((user) => user.monster.name.replace(/^（仮）/, '')).join('・')) : null,
                ),
                h('span', { class: 'ability-row-arrow', 'aria-hidden': 'true' }, '›'),
              ));
            }))
          : h('p', { class: 'empty' }, '条件に合う能力はありません。'),
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
