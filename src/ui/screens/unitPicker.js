import { h } from '../dom.js';
import { unitRow, sectionTitle } from '../components.js';
import { unitStats } from '../../progression/stats.js';
import { listOwnedUnits } from '../../progression/units.js';
import { setPartySlot, partySlotOf } from '../../progression/party.js';

export default {
  nav: 'party',
  render(ctx, params) {
    const { data, save } = ctx;
    const slot = params.slot;
    const current = save.party[slot];

    const choose = (unitId) => {
      if (ctx.act(() => setPartySlot(save, data, slot, unitId))) ctx.back();
    };

    const rows = listOwnedUnits(save, data).map((u) => {
      const inSlot = partySlotOf(save, u.unitId);
      return unitRow({
        ...u,
        stats: unitStats(save, data, u.unitId),
        onClick: u.unitId === current ? undefined : () => choose(u.unitId),
        aside:
          inSlot === slot
            ? h('span', { class: 'in-party' }, 'この枠')
            : inSlot !== null
              ? h('span', { class: 'in-party muted' }, `編成${inSlot + 1}と交代`)
              : null,
      });
    });

    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '編成に戻る'),
      sectionTitle(`${slot + 1}番目の枠に入れる`),
      current
        ? h(
            'button',
            { type: 'button', class: 'btn btn-block', onClick: () => choose(null) },
            'この枠を空ける',
          )
        : null,
      h('div', { class: 'list' }, rows),
    );
  },
};
