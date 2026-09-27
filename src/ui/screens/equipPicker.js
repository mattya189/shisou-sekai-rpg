/**
 * 装備の付け替え。params: { unitId, slot }
 */
import { h } from '../dom.js';
import { sectionTitle, emptyState } from '../components.js';
import { equipToUnit, findEquipmentOwner } from '../../progression/equipment.js';
import { bonusText } from '../format.js';

export default {
  nav: 'party',
  render(ctx, params) {
    const { data, save } = ctx;
    const { unitId, slot } = params;
    const unit = save.units[unitId];
    const current = unit.equipment[slot];
    const choose = (uid) => {
      if (ctx.act(() => equipToUnit(save, data, unitId, slot, uid))) ctx.back();
    };
    const rows = Object.values(save.inventory.equipment)
      .filter((inst) => inst.uid !== current)
      .map((inst) => {
        const eq = data.get('equipment', inst.defId);
        const owner = findEquipmentOwner(save, inst.uid);
        const ownerName = owner ? data.findUnitDef(save.units[owner].defId)?.def.name : null;
        const bonuses = [
          ...Object.entries(eq.baseStats).map(([k, v]) => bonusText(k, v + (eq.enhancePerPlus?.[k] ?? 0) * inst.plus)),
          ...inst.randomStats.map((r) => bonusText(r.stat, r.value)),
        ];
        return h(
          'button',
          { type: 'button', class: 'item-row static equip-choice', onClick: () => choose(inst.uid) },
          h('span', { class: 'item-name' }, `${eq.name}${inst.plus ? ` +${inst.plus}` : ''}`),
          h('span', { class: 'item-sub' }, bonuses.join('　')),
          ownerName ? h('span', { class: 'item-sub' }, owner === unitId ? '（この仲間のもう一方の枠）' : `${ownerName}が装備中（付け替え）`) : null,
        );
      });
    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '戻る'),
      sectionTitle(`装備${slot + 1}を選ぶ`),
      current ? h('button', { type: 'button', class: 'btn btn-block', onClick: () => choose(null) }, '外す') : null,
      rows.length ? h('div', { class: 'list' }, rows) : emptyState('ほかに装備を持っていません。ショップや工房で手に入ります。'),
    );
  },
};
