import { h } from '../dom.js';
import { partyHpStrip } from '../partyHp.js';
import { performExploreAction, EXPLORE_ACTIONS } from '../../exploration/actions.js';
import { currentNodeId, isInTown } from '../../exploration/map.js';
import { weatherAt } from '../../exploration/time.js';
import { periodName } from '../format.js';
import { dungeonAt, dungeonEntryStatus, enterDungeon } from '../../exploration/dungeon.js';

function itemsText(data, items) {
  return items
    .map((it) => {
      const item = data.get('items', it.itemId);
      const q = item.hasQuality ? `（${data.qualityName(it.quality)}）` : '';
      return `${item.name}${q}×${it.qty}`;
    })
    .join('、');
}

function dungeonEntry(ctx, nodeId) {
  const { data, save, session } = ctx;
  const d = dungeonAt(data, nodeId);
  if (!d) return null;
  const st = dungeonEntryStatus(save, data, d.id);
  const cleared = save.dungeons.cleared[d.id] ?? 0;
  return h(
    'div',
    { class: 'dungeon-entry' },
    h('p', { class: 'dungeon-entry-name' }, d.name, cleared ? h('span', { class: 'new-badge' }, `踏破${cleared}回`) : null),
    h('p', { class: 'help' }, st.ok ? `連戦ダンジョン（${d.stages.length}戦）。入ると行動力を${data.balance.dungeon.enterAp}使います。` : st.reason),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary btn-block',
        disabled: !st.ok,
        onClick: () => {
          if (ctx.act(() => enterDungeon(save, data, d.id, session.rng))) ctx.go('dungeon', {}, { reset: true });
        },
      },
      `${d.name}に入る`,
    ),
  );
}

function optionalStrongEncounters(ctx, loc, state) {
  if (state.dismissedStrong) return null;
  const entries = loc.optionalEncounters ?? [];
  if (!entries.length) return null;
  return h('div', { class: 'optional-strong-list' }, entries.map((enc) => h(
    'div', { class: 'dungeon-entry optional-strong' },
    h('p', { class: 'dungeon-entry-name' }, enc.name, h('span', { class: 'new-badge' }, '任意強敵')),
    h('p', { class: 'help' }, enc.description ?? '通常敵より強い相手。挑戦するか選べる。'),
    h('div', { class: 'result-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => ctx.go('battle', { enemies: enc.enemies, mode: 'field', source: 'optionalStrong', optionalEncounterId: enc.id }) }, '挑戦する'),
      h('button', { type: 'button', class: 'btn', onClick: () => { state.dismissedStrong = true; ctx.rerender(); } }, '今はやめる'),
    ),
  )));
}

export default {
  nav: 'here',
  render(ctx, params, state) {
    const { data, save, session } = ctx;
    if (isInTown(save) || save.dungeonRun) {
      queueMicrotask(() => ctx.go(save.dungeonRun ? 'dungeon' : 'town', {}, { reset: true }));
      return h('section');
    }
    const nodeId = currentNodeId(save);
    const loc = data.get('locations', nodeId);
    const weather = data.find('weathers', weatherAt(save, data, nodeId));
    const region = data.find('regions', loc.region);
    const costs = data.balance.exploration.actions;
    const ap = save.exploration.actionPoints;

    const doAction = (actionId) => {
      let r;
      const ok = ctx.act(() => {
        r = performExploreAction(save, data, actionId, session.rng);
        state.last = r;
      });
      if (!ok) return;
      if (r.outcome.kind === 'encounter') {
        ctx.go('battle', { enemies: r.outcome.enemies, mode: 'field', source: 'field' });
      }
    };

    let resultCard = null;
    const last = state.last;
    if (last && last.outcome.kind !== 'encounter') {
      const o = last.outcome;
      const lines = [h('p', { class: 'result-msg' }, o.message)];
      if (o.items?.length) lines.push(h('p', { class: 'result-items' }, `${itemsText(data, o.items)} を手に入れた`));
      if (last.time.periodsPassed > 0) lines.push(h('p', { class: 'muted small' }, `${periodName(data, save.exploration.time.period)}になった。`));
      resultCard = h('div', { class: `explore-result${o.kind === 'secret' ? ' secret' : ''}`, 'aria-live': 'polite' }, lines);
    }

    const actions = (loc.actions ?? []).map((id) => {
      const a = EXPLORE_ACTIONS[id];
      const cost = costs[id];
      return h(
        'button',
        { type: 'button', class: 'action-btn', disabled: ap < cost.ap, onClick: () => doAction(id) },
        h('span', { class: 'action-name' }, a.name),
        h('span', { class: 'action-cost', 'aria-label': `行動力${cost.ap}` }, `行動力 ${cost.ap}`),
        h('span', { class: 'action-desc' }, a.description),
      );
    });

    return h(
      'section',
      { class: 'location-screen' },
      h(
        'div',
        { class: 'location-hero' },
        h('p', { class: 'location-region' }, region?.name ?? ''),
        h('h1', { class: 'location-name' }, loc.name),
        h('p', { class: 'location-cond' }, `${periodName(data, save.exploration.time.period)}　${weather?.name ?? ''}`, weather?.description ? h('span', { class: 'muted' }, `　${weather.description.replace(/^（仮）/, '')}`) : null),
      ),
      loc.description ? h('p', { class: 'help' }, loc.description) : null,
      resultCard,
      partyHpStrip(save, data),
      actions.length ? h('div', { class: 'action-grid' }, actions) : h('p', { class: 'help' }, 'ここでできることはまだない。'),
      ap === 0 ? h('p', { class: 'notice' }, '行動力がありません。街の宿屋で休むと回復します。') : null,
      optionalStrongEncounters(ctx, loc, state),
      dungeonEntry(ctx, nodeId),
      h('button', { type: 'button', class: 'btn btn-block move-btn', onClick: () => ctx.go('travel') }, '移動する'),
    );
  },
};
