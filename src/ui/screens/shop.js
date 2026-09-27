/**
 * ショップ。params: { shopId, facilityName }
 */
import { h } from '../dom.js';
import { sectionTitle, emptyState } from '../components.js';
import { shopStock, buyItem, buyEquipment, sellItem, itemSellPrice, sellEquipment, equipmentSellPrice } from '../../town/shop.js';
import { getCurrency, countItem } from '../../progression/inventory.js';
import { findEquipmentOwner } from '../../progression/equipment.js';
import { bonusText } from '../format.js';

const TABS = [
  { id: 'buy', label: '買う' },
  { id: 'sell', label: '売る' },
];

export default {
  nav: 'here',
  render(ctx, params, state) {
    const { data, save, session } = ctx;
    const shopId = params.shopId;
    const shop = data.get('shops', shopId);
    state.tab ??= 'buy';
    const gold = getCurrency(save, data.balance.goldCurrencyId);

    const tabs = h(
      'div',
      { class: 'chips', role: 'tablist' },
      TABS.map((t) =>
        h('button', { type: 'button', role: 'tab', class: `chip${state.tab === t.id ? ' active' : ''}`, 'aria-selected': String(state.tab === t.id), onClick: () => { state.tab = t.id; ctx.rerender(); } }, t.label),
      ),
    );

    let body;
    if (state.tab === 'buy') {
      const stock = shopStock(save, data, shopId);
      const itemRows = stock.items.map((e) => {
        const item = data.get('items', e.itemId);
        const q = item.hasQuality ? `（${data.qualityName(e.quality)}）` : '';
        return h(
          'li',
          { class: 'shop-row' },
          h('span', { class: 'shop-name' }, `${item.name}${q}`, h('span', { class: 'shop-sub' }, `所持 ${countItem(save, e.itemId, e.quality)}`)),
          h('span', { class: 'shop-price' }, `${e.price}G`),
          h('span', { class: 'shop-actions' },
            [1, 5].map((n) => h('button', { type: 'button', class: 'btn btn-small', disabled: gold < e.price * n, onClick: () => ctx.act(() => buyItem(save, data, shopId, e.index, n), `${item.name}${q}を${n}個買った`) }, `${n}個`)),
          ),
        );
      });
      const equipRows = stock.equipment.map((e) => {
        const eq = data.get('equipment', e.defId);
        return h(
          'li',
          { class: 'shop-row' },
          h('span', { class: 'shop-name' }, eq.name, h('span', { class: 'shop-sub' }, `${Object.entries(eq.baseStats).map(([k, v]) => bonusText(k, v)).join('　')}　ランダム能力${eq.randomStats?.count ?? 0}つ`)),
          h('span', { class: 'shop-price' }, `${e.price}G`),
          h('span', { class: 'shop-actions' }, h('button', { type: 'button', class: 'btn btn-small', disabled: gold < e.price, onClick: () => ctx.act(() => buyEquipment(save, data, shopId, e.index, session.rng), `${eq.name}を買った`) }, '買う')),
        );
      });
      body = [
        h('h3', { class: 'sub-title' }, 'アイテム'),
        itemRows.length ? h('ul', { class: 'shop-list' }, itemRows) : emptyState('品切れです。'),
        h('h3', { class: 'sub-title' }, '装備'),
        equipRows.length ? h('ul', { class: 'shop-list' }, equipRows) : emptyState('品切れです。'),
      ];
    } else {
      const itemRows = [];
      for (const item of data.list('items')) {
        for (const q of data.balance.qualities) {
          const n = countItem(save, item.id, q.id);
          if (!n) continue;
          const price = itemSellPrice(data, shopId, item.id, q.id);
          if (!price) continue;
          const label = `${item.name}${item.hasQuality ? `（${q.name}）` : ''}`;
          itemRows.push(
            h(
              'li',
              { class: 'shop-row' },
              h('span', { class: 'shop-name' }, label, h('span', { class: 'shop-sub' }, `所持 ${n}`)),
              h('span', { class: 'shop-price' }, `${price}G`),
              h('span', { class: 'shop-actions' },
                h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => sellItem(save, data, shopId, item.id, q.id, 1), (r) => `${label}を売った（+${r?.gained ?? price}G）`) }, '1個'),
                h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => sellItem(save, data, shopId, item.id, q.id, n), `${label}を${n}個売った`) }, '全部'),
              ),
            ),
          );
        }
      }
      const equipRows = Object.values(save.inventory.equipment)
        .filter((inst) => !findEquipmentOwner(save, inst.uid))
        .map((inst) => {
          const eq = data.get('equipment', inst.defId);
          const price = equipmentSellPrice(save, data, shopId, inst.uid);
          return h(
            'li',
            { class: 'shop-row' },
            h('span', { class: 'shop-name' }, `${eq.name}${inst.plus ? ` +${inst.plus}` : ''}`, h('span', { class: 'shop-sub' }, inst.randomStats.map((r) => bonusText(r.stat, r.value)).join('　'))),
            h('span', { class: 'shop-price' }, `${price}G`),
            h('span', { class: 'shop-actions' }, h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => sellEquipment(save, data, shopId, inst.uid), `${eq.name}を売った`) }, '売る')),
          );
        });
      body = [
        h('h3', { class: 'sub-title' }, 'アイテム'),
        itemRows.length ? h('ul', { class: 'shop-list' }, itemRows) : emptyState('売れるアイテムがありません。'),
        h('h3', { class: 'sub-title' }, '装備', h('span', { class: 'section-note' }, '　装備中のものは売れません')),
        equipRows.length ? h('ul', { class: 'shop-list' }, equipRows) : emptyState('売れる装備がありません。'),
      ];
    }

    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '街に戻る'),
      sectionTitle(params.facilityName ?? shop.name, `所持 ${gold.toLocaleString()}G`),
      tabs,
      body,
    );
  },
};
