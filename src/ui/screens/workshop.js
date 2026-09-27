/**
 * 工房: 装備強化と製作。params: { facilityName }
 */
import { h } from '../dom.js';
import { sectionTitle, emptyState } from '../components.js';
import { enhanceEquipment, enhanceCost } from '../../progression/enhance.js';
import { recipeStatus, craft } from '../../town/crafting.js';
import { getCurrency, countItem } from '../../progression/inventory.js';
import { findEquipmentOwner } from '../../progression/equipment.js';
import { bonusText } from '../format.js';

const TABS = [
  { id: 'enhance', label: '強化' },
  { id: 'craft', label: '製作' },
];

export default {
  nav: 'here',
  render(ctx, params, state) {
    const { data, save, session } = ctx;
    state.tab ??= 'enhance';
    const gold = getCurrency(save, data.balance.goldCurrencyId);
    const max = data.balance.equipment.maxPlus;

    const tabs = h(
      'div',
      { class: 'chips', role: 'tablist' },
      TABS.map((t) =>
        h('button', { type: 'button', role: 'tab', class: `chip${state.tab === t.id ? ' active' : ''}`, 'aria-selected': String(state.tab === t.id), onClick: () => { state.tab = t.id; ctx.rerender(); } }, t.label),
      ),
    );

    let body;
    if (state.tab === 'enhance') {
      const rows = Object.values(save.inventory.equipment).map((inst) => {
        const eq = data.get('equipment', inst.defId);
        const owner = findEquipmentOwner(save, inst.uid);
        const ownerName = owner ? data.findUnitDef(save.units[owner].defId)?.def.name : null;
        const now = Object.entries(eq.baseStats).map(([k, v]) => bonusText(k, v + (eq.enhancePerPlus?.[k] ?? 0) * inst.plus)).join('　');
        const isMax = inst.plus >= max;
        const cost = isMax ? null : enhanceCost(data, inst.plus);
        const item = cost ? data.get('items', cost.itemId) : null;
        return h(
          'li',
          { class: 'shop-row' },
          h(
            'span',
            { class: 'shop-name' },
            `${eq.name} +${inst.plus}`,
            h('span', { class: 'shop-sub' }, now),
            ownerName ? h('span', { class: 'shop-sub' }, `装備中: ${ownerName}`) : null,
            cost ? h('span', { class: 'shop-sub' }, `費用: ${item.name}×${cost.qty}（所持${countItem(save, cost.itemId)}）・${cost.gold}G`) : null,
          ),
          h('span', { class: 'shop-actions' },
            h('button', { type: 'button', class: 'btn btn-small', disabled: isMax, onClick: () => ctx.act(() => enhanceEquipment(save, data, inst.uid), (r) => `${eq.name}が+${r.plus}になった`) }, isMax ? '最大' : '強化'),
          ),
        );
      });
      body = [h('p', { class: 'help' }, `強化石とゴールドで装備を強化します（最大+${max}）。`), rows.length ? h('ul', { class: 'shop-list' }, rows) : emptyState('装備を持っていません。')];
    } else {
      const rows = data.list('recipes').map((rc) => {
        const st = recipeStatus(save, data, rc.id);
        return h(
          'li',
          { class: 'shop-row' },
          h(
            'span',
            { class: 'shop-name' },
            rc.name,
            st.inputs.map((i) =>
              h('span', { class: `shop-sub${i.enough ? '' : ' lacking'}` }, `${i.item.name}${i.minQuality ? `（${data.qualityName(i.minQuality)}以上）` : ''} ${i.have}/${i.qty}`),
            ),
            rc.gold ? h('span', { class: `shop-sub${st.goldOk ? '' : ' lacking'}` }, `${rc.gold}G`) : null,
          ),
          h('span', { class: 'shop-actions' }, h('button', { type: 'button', class: 'btn btn-small', disabled: !st.canCraft, onClick: () => ctx.act(() => craft(save, data, rc.id, session.rng), `${rc.name}を作った`) }, '作る')),
        );
      });
      body = [h('p', { class: 'help' }, '素材を使って装備や道具を作ります。品質の指定がある素材は、その品質以上のものを使います。'), rows.length ? h('ul', { class: 'shop-list' }, rows) : emptyState('作れるものがありません。')];
    }

    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '街に戻る'),
      sectionTitle(params.facilityName ?? '工房', `所持 ${gold.toLocaleString()}G`),
      tabs,
      body,
    );
  },
};
