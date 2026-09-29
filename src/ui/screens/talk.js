/**
 * 住民・酒場・街探索（イベントが起きる施設）の画面。
 * params: { trigger, nodeId, facilityName }
 * 開いたときに1回イベントを抽選する。「もう一度」でもう1回。街探索は時間が進む。
 */
import { h } from '../dom.js';
import { sectionTitle } from '../components.js';
import { triggerEvent } from '../../events/events.js';
import { advanceTime } from '../../exploration/time.js';

export default {
  nav: 'home',
  render(ctx, params, state) {
    const { data, save, session } = ctx;
    const again = () => {
      ctx.act(() => {
        state.result = triggerEvent(save, data, params.trigger, params.nodeId, session.rng);
        if (params.trigger === 'townExplore') advanceTime(save, data, data.balance.townExplore.time, session.rng);
      });
    };
    if (!state.started) {
      // 描画中に再描画しないよう、描画が終わってから最初のイベントを起こす
      state.started = true;
      queueMicrotask(again);
      return h('section');
    }
    const r = state.result;
    const label = { residents: 'もう一度話しかける', tavern: 'ほかの客の話を聞く', townExplore: 'もう少し歩く' }[params.trigger] ?? 'もう一度';
    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '街に戻る'),
      sectionTitle(params.facilityName ?? ''),
      h(
        'div',
        { class: 'talk-box', 'aria-live': 'polite' },
        r ? r.lines.map((l) => h('p', {}, l)) : h('p', { class: 'muted' }, '今は誰もいないようだ。'),
        r?.results.length ? h('p', { class: 'result-items' }, r.results.join('、')) : null,
      ),
      params.trigger === 'townExplore' ? h('p', { class: 'help' }, '街を歩くと少し時間が進みます（行動力は使いません）。') : null,
      h('button', { type: 'button', class: 'btn btn-block', onClick: again }, label),
    );
  },
};
