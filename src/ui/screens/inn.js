import { h } from '../dom.js';
import { sectionTitle } from '../components.js';
import { partyHpStrip } from '../partyHp.js';
import { restAtInn } from '../../game/inn.js';
import { getCurrency } from '../../progression/inventory.js';

export default {
  nav: 'here',
  render(ctx, params, state) {
    const { data, save, session } = ctx;
    const cost = data.balance.inn.cost;
    const gold = getCurrency(save, data.balance.goldCurrencyId);
    const ex = save.exploration;

    const rest = () => {
      if (ctx.act(() => restAtInn(save, data, session.rng))) {
        state.rested = true;
        ctx.rerender();
      }
    };

    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '街に戻る'),
      sectionTitle(params.facilityName ?? '宿屋'),
      state.rested
        ? h('p', { class: 'notice' }, `ぐっすり休んだ。${ex.time.day}日目の朝になった。行動力とHPが回復した。`)
        : h('p', { class: 'help' }, '休むと行動力とHPがすべて回復し、翌日の朝になります。'),
      partyHpStrip(save, data),
      h(
        'dl',
        { class: 'kv' },
        h('div', {}, h('dt', {}, '行動力'), h('dd', {}, `${ex.actionPoints} / ${ex.maxActionPoints}`)),
        h('div', {}, h('dt', {}, '宿代'), h('dd', {}, `${cost}G（所持 ${gold.toLocaleString()}G）`)),
      ),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', disabled: gold < cost, onClick: rest }, `休む（${cost}G）`),
    );
  },
};
