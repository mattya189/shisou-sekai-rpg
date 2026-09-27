import { h } from '../dom.js';
import { sectionTitle, emptyState } from '../components.js';
import { listOwnedItems, getCurrency } from '../../progression/inventory.js';
import { findEquipmentOwner } from '../../progression/equipment.js';
import { ITEM_CATEGORY_LABEL, bonusText } from '../format.js';
import { useItem, ITEM_USES } from '../../progression/consumables.js';
import { partyMembers } from '../../progression/party.js';
import { currentHp } from '../../progression/hp.js';
import { unitStats } from '../../progression/stats.js';

const TABS = [
  { id: 'material', label: '素材' },
  { id: 'consumable', label: '消耗品' },
  { id: 'equipment', label: '装備' },
  { id: 'growth', label: '育成' },
  { id: 'key', label: '重要' },
];

/** 消耗品を誰に使うか選ぶ */
function useTargets(ctx, state, item) {
  const { data, save } = ctx;
  const q = state.using.quality;
  return h(
    'div',
    { class: 'use-targets' },
    h('p', { class: 'item-desc' }, `${data.qualityName(q)}の${item.name}を誰に使う？`),
    partyMembers(save).map((id) => {
      const def = data.findUnitDef(save.units[id].defId).def;
      return h(
        'button',
        {
          type: 'button',
          class: 'btn btn-small',
          onClick: () => {
            ctx.act(
              () => {
                const r = useItem(save, data, item.id, q, id);
                if (!save.inventory.items[item.id]?.[q]) state.using = null;
                return r;
              },
              (r) => `${def.name}のHPが${r.healed}回復した`,
            );
          },
        },
        `${def.name.replace(/^（仮）/, '')} ${currentHp(save, data, id)}/${unitStats(save, data, id).hp}`,
      );
    }),
  );
}

export default {
  nav: 'inventory',
  render(ctx, params, state) {
    const { data, save } = ctx;
    state.tab ??= 'material';
    state.open ??= {};

    const currencies = h(
      'dl',
      { class: 'currency-row' },
      data.list('currencies').map((c) => h('div', {}, h('dt', {}, c.name), h('dd', {}, getCurrency(save, c.id).toLocaleString()))),
    );

    const tabs = h(
      'div',
      { class: 'chips', role: 'tablist' },
      TABS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: `chip${state.tab === t.id ? ' active' : ''}`,
            'aria-selected': state.tab === t.id ? 'true' : 'false',
            onClick: () => {
              state.tab = t.id;
              ctx.rerender();
            },
          },
          t.label,
        ),
      ),
    );

    let body;
    if (state.tab === 'equipment') {
      const list = Object.values(save.inventory.equipment);
      body = list.length
        ? h(
            'ul',
            { class: 'item-list' },
            list.map((inst) => {
              const eq = data.find('equipment', inst.defId);
              if (!eq) return null;
              const owner = findEquipmentOwner(save, inst.uid);
              const ownerName = owner ? data.findUnitDef(save.units[owner].defId)?.def.name : null;
              return h(
                'li',
                { class: 'item-row static' },
                h('span', { class: 'item-name' }, `${eq.name}${inst.plus ? ` +${inst.plus}` : ''}`),
                h(
                  'span',
                  { class: 'item-sub' },
                  [...Object.entries(eq.baseStats).map(([k, v]) => bonusText(k, v + (eq.enhancePerPlus?.[k] ?? 0) * inst.plus)), ...inst.randomStats.map((r) => bonusText(r.stat, r.value))].join('　'),
                ),
                ownerName ? h('span', { class: 'item-sub' }, `装備中: ${ownerName}`) : null,
              );
            }),
          )
        : emptyState('装備を持っていません。');
    } else {
      const items = listOwnedItems(save, data, state.tab);
      body = items.length
        ? h(
            'ul',
            { class: 'item-list' },
            items.map(({ item, total, byQuality }) => {
              const open = Boolean(state.open[item.id]);
              const canExpand = item.hasQuality;
              return h(
                'li',
                {},
                h(
                  canExpand ? 'button' : 'div',
                  {
                    type: canExpand ? 'button' : undefined,
                    class: `item-row${canExpand ? '' : ' static'}`,
                    'aria-expanded': canExpand ? String(open) : undefined,
                    onClick: canExpand
                      ? () => {
                          state.open[item.id] = !open;
                          ctx.rerender();
                        }
                      : undefined,
                  },
                  h('span', { class: 'item-name' }, item.name),
                  h('span', { class: 'item-total' }, canExpand ? `合計 ${total}` : `×${total}`),
                ),
                open
                  ? h(
                      'div',
                      { class: 'quality-breakdown' },
                      byQuality.map((q) => {
                        const usable = Boolean(ITEM_USES[item.use?.type]);
                        const selected = state.using?.itemId === item.id && state.using?.quality === q.id;
                        return usable
                          ? h(
                              'button',
                              {
                                type: 'button',
                                class: `quality quality-${q.id} quality-btn${selected ? ' selected' : ''}`,
                                'aria-pressed': String(selected),
                                onClick: () => {
                                  state.using = selected ? null : { itemId: item.id, quality: q.id };
                                  ctx.rerender();
                                },
                              },
                              `${q.name} ×${q.count}`,
                            )
                          : h('span', { class: `quality quality-${q.id}` }, `${q.name} ×${q.count}`);
                      }),
                      item.description ? h('p', { class: 'item-desc' }, item.description) : null,
                      state.using?.itemId === item.id ? useTargets(ctx, state, item) : null,
                    )
                  : null,
              );
            }),
          )
        : emptyState(`${ITEM_CATEGORY_LABEL[state.tab]}を持っていません。`);
    }

    return h('section', {}, sectionTitle('所持品'), currencies, tabs, body);
  },
};
