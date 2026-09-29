import { h } from '../dom.js';
import { partyHpStrip } from '../partyHp.js';
import { startExploreCommand, clearExploreEvent, resolveExploreChoice, EXPLORE_ACTIONS } from '../../exploration/actions.js';
import { currentNodeId } from '../../exploration/map.js';
import { weatherAt } from '../../exploration/time.js';
import { periodName } from '../format.js';
import { dungeonAt, dungeonEntryStatus, enterDungeon } from '../../exploration/dungeon.js';
import { staminaStatus, formatRecovery } from '../../exploration/stamina.js';

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
    h('p', { class: 'help' }, st.ok ? `連戦ダンジョン（${d.stages.length}戦）。入るとスタミナを${data.balance.dungeon.enterAp}使います。` : st.reason),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary btn-block',
        disabled: !st.ok,
        onClick: () => {
          if (ctx.act(() => enterDungeon(save, data, d.id, session.rng, session.now()))) ctx.go('dungeon', {}, { reset: true });
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

function eventCard(ctx, loc) {
  const { data, save } = ctx;
  const pending = save.exploration.pendingEvent;
  if (!pending || pending.nodeId !== loc.id) return null;
  const o = pending.outcome;
  const lines = [h('p', { class: 'event-message' }, o.message ?? '何かが起きた。')];
  if (o.items?.length) lines.push(h('p', { class: 'result-items' }, `${itemsText(data, o.items)} を手に入れた`));
  if (pending.time?.periodsPassed > 0) lines.push(h('p', { class: 'muted small' }, `${periodName(data, save.exploration.time.period)}になった。`));

  const close = () => ctx.act(() => clearExploreEvent(save));
  const repeat = () => ctx.act(() => {
    clearExploreEvent(save);
    return startExploreCommand(save, data, pending.actionId, ctx.session.rng, ctx.session.now());
  });
  let choices;
  if (o.kind === 'choice') {
    choices = o.choices.map((choice) => h(
      'button',
      { type: 'button', class: 'btn', onClick: () => ctx.act(() => resolveExploreChoice(save, data, choice.id)) },
      choice.label,
    ));
  } else if (o.kind === 'encounter') {
    const enemyText = o.enemies.map((enemy) => `${data.get('monsters', enemy.defId).name} Lv.${enemy.level}`).join('、');
    if (o.observed) lines.push(h('p', { class: 'event-detail' }, enemyText));
    const fight = () => {
      const enemies = structuredClone(o.enemies);
      if (!ctx.act(() => clearExploreEvent(save))) return;
      ctx.go('battle', { enemies, mode: 'field', source: 'field', returnLocationId: loc.id });
    };
    choices = [
      h('button', { type: 'button', class: 'btn btn-primary', onClick: fight }, '戦う'),
      h('button', { type: 'button', class: 'btn', disabled: Boolean(o.observed), onClick: () => ctx.act(() => { save.exploration.pendingEvent.outcome.observed = true; }) }, o.observed ? '確認済み' : '様子を見る'),
      h('button', { type: 'button', class: 'btn', onClick: close }, '逃げる'),
    ];
  } else if (o.kind === 'strongHint') {
    const strong = (loc.optionalEncounters ?? []).find((entry) => entry.id === o.optionalEncounterId);
    choices = strong ? [
      h('button', { type: 'button', class: 'btn btn-danger', onClick: () => {
        if (!ctx.act(() => clearExploreEvent(save))) return;
        ctx.go('battle', { enemies: strong.enemies, mode: 'field', source: 'optionalStrong', optionalEncounterId: strong.id, returnLocationId: loc.id });
      } }, '挑戦する'),
      h('button', { type: 'button', class: 'btn', onClick: close }, '今はやめる'),
    ] : [h('button', { type: 'button', class: 'btn btn-primary', onClick: close }, '進む')];
  } else {
    choices = [
      h('button', { type: 'button', class: 'btn btn-primary', onClick: repeat }, 'もう一度探索'),
      h('button', { type: 'button', class: 'btn', onClick: close }, '閉じる'),
    ];
  }
  return h(
    'div',
    { class: `exploration-event event-${o.eventType ?? o.kind}`, 'aria-live': 'polite' },
    h('p', { class: 'event-kicker' }, o.kind === 'encounter' ? 'ENCOUNTER' : o.kind === 'strongHint' ? 'DANGER' : '探索結果'),
    ...lines,
    h('div', { class: 'event-choices' }, choices),
  );
}

export default {
  nav: 'adventure',
  render(ctx, params, state) {
    const { data, save, session } = ctx;
    if (save.dungeonRun) {
      queueMicrotask(() => ctx.go('dungeon', {}, { reset: true }));
      return h('section');
    }
    const nodeId = params.locationId ?? save.exploration.adventureId ?? currentNodeId(save);
    if (!data.has('locations', nodeId)) {
      queueMicrotask(() => ctx.go('travel', {}, { reset: true }));
      return h('section');
    }
    const loc = data.get('locations', nodeId);
    const weather = data.find('weathers', weatherAt(save, data, nodeId));
    const region = data.find('regions', loc.region);
    const costs = data.balance.exploration.actions;
    const ap = save.exploration.actionPoints;

    const hasPending = Boolean(save.exploration.pendingEvent);
    const doAction = (actionId) => {
      if (state.processing || save.exploration.pendingEvent) return;
      state.processing = true;
      const ok = ctx.act(() => startExploreCommand(save, data, actionId, session.rng, session.now()));
      state.processing = false;
      return ok;
    };

    const actions = (loc.actions ?? []).map((id) => {
      const a = EXPLORE_ACTIONS[id];
      const cost = costs[id];
      return h(
        'button',
        { type: 'button', class: `action-btn${id === 'explore' ? ' primary-command' : ''}`, disabled: ap < cost.ap || hasPending || state.processing, onClick: () => doAction(id) },
        h('span', { class: 'action-name' }, a.name),
        h('span', { class: 'action-cost', 'aria-label': `スタミナ${cost.ap}` }, `スタミナ ${cost.ap}`),
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
      eventCard(ctx, loc),
      partyHpStrip(save, data),
      h('div', { class: 'command-heading' }, h('strong', {}, '行動を選ぶ'), h('span', { class: 'stamina-inline' }, `スタミナ ${ap}/${save.exploration.maxActionPoints}　次 ${formatRecovery(staminaStatus(save, data, session.now()).nextRecoveryMs)}`)),
      actions.length ? h('div', { class: `action-grid${hasPending ? ' has-pending' : ''}` }, actions) : h('p', { class: 'help' }, 'ここでできることはまだない。'),
      ap === 0 ? h('p', { class: 'notice' }, 'スタミナがありません。30秒ごとに1回復します。') : null,
      hasPending ? null : optionalStrongEncounters(ctx, loc, state),
      hasPending ? null : dungeonEntry(ctx, nodeId),
      h('button', { type: 'button', class: 'btn btn-block move-btn', disabled: hasPending, onClick: () => ctx.go('travel', {}, { reset: true }) }, '冒険先一覧へ'),
    );
  },
};
