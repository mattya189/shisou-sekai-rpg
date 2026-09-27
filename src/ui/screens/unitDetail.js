import { h } from '../dom.js';
import { portrait, kindBadge, sectionTitle, emptyState } from '../components.js';
import { unitStats } from '../../progression/stats.js';
import { expToNext } from '../../progression/leveling.js';
import { learnedSkillIds, upcomingSkills, equipSkill, unequipSkill, moveSkill } from '../../progression/skillLoadout.js';
import { describeCondition } from '../../battle/conditions.js';
import { seconds, bonusText } from '../format.js';
import { currentHp } from '../../progression/hp.js';
import { nextRankCost, rankUp } from '../../progression/rankUp.js';

function skillBody(data, skill) {
  return h(
    'span',
    { class: 'skill-body' },
    h('span', { class: 'skill-name' }, skill.name),
    h('span', { class: 'skill-trigger' }, `発動: ${describeCondition(skill.trigger, data)}　MP ${skill.mpCost}`),
    skill.description ? h('span', { class: 'skill-desc' }, skill.description) : null,
  );
}

export default {
  nav: 'party',
  render(ctx, params) {
    const { data, save } = ctx;
    const unitId = params.unitId;
    const unit = save.units[unitId];
    const found = unit ? data.findUnitDef(unit.defId) : null;
    if (!found) {
      return h('section', {}, emptyState('このユニットは見つかりません。'), h('button', { class: 'btn', type: 'button', onClick: () => ctx.back() }, '戻る'));
    }
    const { def, kind } = found;
    const stats = unitStats(save, data, unitId);
    const element = data.find('elements', def.element);
    const max = data.balance.skills.maxEquipped;
    const need = expToNext(unit.level, data.balance);

    const head = h(
      'div',
      { class: 'unit-head' },
      portrait(def, kind, 'lg'),
      h(
        'div',
        { class: 'unit-head-text' },
        h('h1', { class: 'unit-name' }, def.name),
        h('div', { class: 'unit-row-meta' }, kindBadge(kind, def), element ? h('span', {}, `属性 ${element.name}`) : null),
        h('p', { class: 'unit-level' }, `Lv.${unit.level}`, h('span', { class: 'muted' }, ` / ${data.balance.levelCap}`), `　ランク${unit.rank}`),
        h(
          'div',
          { class: 'expbar', role: 'progressbar', 'aria-label': '次のレベルまで', 'aria-valuenow': unit.exp, 'aria-valuemax': need || 1 },
          h('span', { style: { width: need ? `${Math.min(100, (unit.exp / need) * 100)}%` : '100%' } }),
        ),
        h('p', { class: 'muted small' }, need ? `次のレベルまで ${need - unit.exp}` : 'レベル上限です'),
      ),
    );

    const statGrid = h(
      'dl',
      { class: 'stat-grid' },
      [
        ['HP', `${currentHp(save, data, unitId)}/${stats.hp}`],
        ['MP', stats.mp],
        ['攻撃', stats.atk],
        ['防御', stats.def],
        ['攻撃間隔', seconds(stats.attackIntervalMs)],
      ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
    );

    const equipped = unit.equippedSkills;
    const equippedList = equipped.length
      ? h(
          'ol',
          { class: 'skill-list' },
          equipped.map((sid, i) => {
            const skill = data.find('skills', sid);
            if (!skill) return null;
            return h(
              'li',
              { class: 'skill-item' },
              h('span', { class: 'priority', 'aria-label': `優先順位${i + 1}` }, i + 1),
              skillBody(data, skill),
              h(
                'span',
                { class: 'skill-actions' },
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': '優先順位を上げる', disabled: i === 0, onClick: () => ctx.act(() => moveSkill(save, unitId, i, i - 1)) }, '▲'),
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': '優先順位を下げる', disabled: i === equipped.length - 1, onClick: () => ctx.act(() => moveSkill(save, unitId, i, i + 1)) }, '▼'),
                h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => unequipSkill(save, data, unitId, sid)) }, '外す'),
              ),
            );
          }),
        )
      : emptyState('特技がセットされていません。セットしない場合は通常攻撃だけを行います。');

    const learned = learnedSkillIds(data, unit).filter((sid) => !equipped.includes(sid));
    const learnedList = learned.length
      ? h(
          'ul',
          { class: 'skill-list' },
          learned.map((sid) => {
            const skill = data.get('skills', sid);
            return h(
              'li',
              { class: 'skill-item' },
              skillBody(data, skill),
              h(
                'span',
                { class: 'skill-actions' },
                h(
                  'button',
                  { type: 'button', class: 'btn btn-small', disabled: equipped.length >= max, onClick: () => ctx.act(() => equipSkill(save, data, unitId, sid)) },
                  'セット',
                ),
              ),
            );
          }),
        )
      : emptyState('ほかに習得済みの特技はありません。');

    const upcoming = upcomingSkills(data, unit);
    const upcomingList = upcoming.length
      ? h(
          'ul',
          { class: 'skill-list locked' },
          upcoming.map((l) => {
            const skill = data.get('skills', l.skillId);
            return h('li', { class: 'skill-item' }, h('span', { class: 'lock-level' }, `Lv.${l.level}`), skillBody(data, skill));
          }),
        )
      : null;

    const passives = (def.passives ?? []).map((pid) => data.find('passives', pid)).filter(Boolean);
    const passiveList = passives.length
      ? h('ul', { class: 'plain-list' }, passives.map((p) => h('li', {}, h('strong', {}, p.name), h('span', { class: 'muted' }, `　${p.description}`))))
      : emptyState('固有パッシブはありません。');

    const equipList = h(
      'div',
      { class: 'list' },
      unit.equipment.map((uid, i) => {
        const inst = uid ? save.inventory.equipment[uid] : null;
        const eq = inst ? data.find('equipment', inst.defId) : null;
        const bonuses = eq
          ? [
              ...Object.entries(eq.baseStats).map(([k, v]) => bonusText(k, v + (eq.enhancePerPlus?.[k] ?? 0) * inst.plus)),
              ...inst.randomStats.map((r) => bonusText(r.stat, r.value)),
            ]
          : [];
        return h(
          'button',
          { type: 'button', class: 'item-row static equip-choice', onClick: () => ctx.go('equipPicker', { unitId, slot: i }) },
          h('span', { class: 'item-sub' }, `装備${i + 1}`),
          h('span', { class: 'item-name' }, eq ? `${eq.name}${inst.plus ? ` +${inst.plus}` : ''}` : 'なし（タップして装備）'),
          bonuses.length ? h('span', { class: 'item-sub' }, bonuses.join('　')) : null,
        );
      }),
    );

    const rc = nextRankCost(save, data, unitId);
    const rankBox = rc
      ? h(
          'div',
          { class: 'rank-box' },
          h('p', {}, `ランク${unit.rank} → ${rc.rank}（能力 ×${rc.multiplier}）`),
          h(
            'p',
            { class: 'muted small' },
            [...rc.items.map((i) => `${data.get('items', i.itemId).name} ${i.have}/${i.qty}`), rc.gold ? `${rc.gold}G（所持 ${rc.haveGold}）` : null].filter(Boolean).join('　'),
          ),
          h('button', { type: 'button', class: 'btn btn-small', disabled: !rc.canPay, onClick: () => ctx.act(() => rankUp(save, data, unitId), (r) => `ランク${r}になった！`) }, 'ランクアップ'),
        )
      : h('p', { class: 'muted small' }, '最大ランクです。');

    return h(
      'section',
      {},
      h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '戻る'),
      head,
      statGrid,
      sectionTitle('戦闘で使う特技', `${equipped.length}/${max}・上ほど優先`),
      h('p', { class: 'help' }, '攻撃のたびに上から順に発動条件を確かめ、条件を満たしてMPが足りる特技を1つだけ使います。どれも使えないときは通常攻撃です。'),
      equippedList,
      sectionTitle('習得済みの特技'),
      learnedList,
      upcomingList ? sectionTitle('これから覚える特技') : null,
      upcomingList,
      sectionTitle('固有パッシブ'),
      passiveList,
      sectionTitle('装備', 'タップして付け替え'),
      equipList,
      sectionTitle('ランク'),
      rankBox,
      def.description ? h('p', { class: 'unit-desc' }, def.description) : null,
    );
  },
};
