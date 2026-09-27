/**
 * 編成メンバーのHPを小さく並べる部品（地点・宿屋で使う）。
 */
import { h } from './dom.js';
import { partyMembers } from '../progression/party.js';
import { currentHp } from '../progression/hp.js';
import { unitStats } from '../progression/stats.js';

export function partyHpStrip(save, data) {
  return h(
    'ul',
    { class: 'hp-strip', 'aria-label': 'パーティのHP' },
    partyMembers(save).map((id) => {
      const def = data.findUnitDef(save.units[id].defId)?.def;
      const max = unitStats(save, data, id).hp;
      const hp = currentHp(save, data, id);
      return h(
        'li',
        { class: hp === 0 ? 'down' : '' },
        h('span', { class: 'hp-strip-name' }, def?.name.replace(/^（仮）/, '') ?? id),
        h('span', { class: 'bar bar-hp' }, h('span', { class: 'bar-fill', style: { width: `${(hp / max) * 100}%` } })),
        h('span', { class: 'hp-strip-num' }, `${hp}/${max}`),
      );
    }),
  );
}
