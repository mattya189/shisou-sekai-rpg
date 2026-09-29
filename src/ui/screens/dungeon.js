/**
 * 連戦ダンジョンの画面（進行状況・次の戦闘・撤退）。
 * params.cleared / params.ended: 直前の戦闘でダンジョンが終わったときの表示用
 */
import { h } from '../dom.js';
import { partyHpStrip } from '../partyHp.js';
import { nextDungeonBattle, retreatDungeon } from '../../exploration/dungeon.js';
import { partyMembers } from '../../progression/party.js';
import { unitStats } from '../../progression/stats.js';

export default {
  nav: 'adventure',
  render(ctx, params, state) {
    const { data, save, session } = ctx;
    const run = save.dungeonRun;

    if (!run) {
      const d = params.dungeonId ? data.find('dungeons', params.dungeonId) : null;
      return h(
        'section',
        { class: 'dungeon-screen' },
        h('div', { class: 'location-hero' }, h('h1', { class: 'location-name' }, d?.name ?? 'ダンジョン')),
        h('p', { class: 'notice' }, params.cleared ? '最深部の敵を倒し、ダンジョンを踏破した！' : 'ダンジョンから出た。'),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => ctx.go(save.exploration.adventureId ? 'location' : 'travel', {}, { reset: true }) }, '冒険先へ戻る'),
      );
    }

    const d = data.get('dungeons', run.dungeonId);
    const steps = d.stages.map((st, i) =>
      h('li', { class: `stage${i < run.stage ? ' done' : ''}${i === run.stage ? ' current' : ''}${st.bossId ? ' boss' : ''}` }, st.bossId ? 'ボス' : `${i + 1}`),
    );
    const nextIsBoss = Boolean(d.stages[run.stage]?.bossId);
    const mpLines = partyMembers(save).map((id) => {
      const max = unitStats(save, data, id).mp;
      const mp = run.mp[id] ?? max;
      const def = data.findUnitDef(save.units[id].defId)?.def;
      return h('li', {}, h('span', { class: 'hp-strip-name' }, def?.name.replace(/^（仮）/, '')), h('span', { class: 'bar bar-mp' }, h('span', { class: 'bar-fill', style: { width: `${(mp / max) * 100}%` } })), h('span', { class: 'hp-strip-num' }, `${mp}/${max}`));
    });

    const fight = () => {
      let p;
      if (ctx.act(() => (p = nextDungeonBattle(save, data, session.rng)))) ctx.go('battle', { ...p, dungeonId: d.id });
    };
    const retreat = () => {
      if (!state.confirmRetreat) {
        state.confirmRetreat = true;
        ctx.rerender();
        return;
      }
      if (ctx.act(() => retreatDungeon(save))) ctx.go('location', {}, { reset: true });
    };

    return h(
      'section',
      { class: 'dungeon-screen' },
      h('div', { class: 'location-hero' }, h('p', { class: 'location-region' }, '連戦ダンジョン'), h('h1', { class: 'location-name' }, d.name)),
      d.description ? h('p', { class: 'help' }, d.description) : null,
      h('ol', { class: 'stage-track', 'aria-label': `${d.stages.length}戦中 ${run.stage + 1}戦目` }, steps),
      partyHpStrip(save, data),
      h('ul', { class: 'hp-strip' }, mpLines),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: fight }, nextIsBoss ? 'ボスに挑む' : `${run.stage + 1}戦目へ進む`),
      h('button', { type: 'button', class: 'btn btn-block', onClick: retreat }, state.confirmRetreat ? '本当に撤退する（ここまでの報酬は残る）' : '撤退する'),
    );
  },
};
