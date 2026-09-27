import { h } from '../dom.js';
import { unitRow, sectionTitle, portrait } from '../components.js';
import { unitStats } from '../../progression/stats.js';
import { listOwnedUnits } from '../../progression/units.js';
import { partySlotOf } from '../../progression/party.js';
import { currentHp } from '../../progression/hp.js';

const FILTERS = [
  { id: 'all', label: 'すべて' },
  { id: 'character', label: '人間' },
  { id: 'monster', label: 'モンスター' },
];

export default {
  nav: 'party',
  render(ctx, params, state) {
    const { data, save } = ctx;
    state.filter ??= 'all';

    const slots = save.party.map((unitId, i) => {
      const found = unitId ? data.findUnitDef(save.units[unitId]?.defId) : null;
      if (!found) {
        return h(
          'div',
          { class: 'party-slot empty-slot' },
          h('span', { class: 'slot-no' }, i + 1),
          h('span', { class: 'slot-empty-label' }, '空き'),
          h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.go('unitPicker', { slot: i }) }, '入れる'),
        );
      }
      const unit = save.units[unitId];
      const stats = unitStats(save, data, unitId);
      return h(
        'div',
        { class: 'party-slot' },
        h('span', { class: 'slot-no' }, i + 1),
        h(
          'button',
          { type: 'button', class: 'party-slot-main', onClick: () => ctx.go('unitDetail', { unitId }) },
          portrait(found.def, found.kind, 'sm'),
          h(
            'span',
            { class: 'party-slot-text' },
            h('span', { class: 'unit-row-name' }, found.def.name),
            h('span', { class: 'unit-row-stats' }, `Lv.${unit.level}　HP ${currentHp(save, data, unitId)}/${stats.hp}　MP ${stats.mp}`),
          ),
        ),
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.go('unitPicker', { slot: i }) }, '入れ替え'),
      );
    });

    const owned = listOwnedUnits(save, data, state.filter === 'all' ? undefined : state.filter);
    const roster = owned.map((u) => {
      const slot = partySlotOf(save, u.unitId);
      return unitRow({
        ...u,
        stats: unitStats(save, data, u.unitId),
        onClick: () => ctx.go('unitDetail', { unitId: u.unitId }),
        aside: slot !== null ? h('span', { class: 'in-party' }, `編成${slot + 1}`) : null,
      });
    });

    return h(
      'section',
      {},
      sectionTitle('パーティ', `${data.balance.party.size}体まで・人間とモンスターを自由に編成`),
      h('div', { class: 'party-slots' }, slots),
      sectionTitle('所持ユニット', `${listOwnedUnits(save, data).length}体`),
      h(
        'div',
        { class: 'chips', role: 'tablist' },
        FILTERS.map((f) =>
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: `chip${state.filter === f.id ? ' active' : ''}`,
              'aria-selected': state.filter === f.id ? 'true' : 'false',
              onClick: () => {
                state.filter = f.id;
                ctx.rerender();
              },
            },
            f.label,
          ),
        ),
      ),
      h('div', { class: 'list' }, roster),
    );
  },
};
