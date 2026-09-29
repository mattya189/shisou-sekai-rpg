/**
 * モンスター図鑑の詳細。段階ごとに開いた情報だけを表示する。params: { monsterId }
 */
import { h } from '../dom.js';
import { sectionTitle, kindBadge } from '../components.js';
import { unitImageSrc } from '../placeholder.js';
import { monsterEntry } from '../../codex/codex.js';
import { ABILITY_KIND_LABEL, skillKind, skillTriggerText } from '../../codex/abilities.js';
import { recruitChance } from '../../game/recruit.js';

function speciesNames(data, def) {
  return def.speciesIds?.length
    ? def.speciesIds.map((id) => data.find('species', id)?.name ?? id)
    : (def.species ?? []);
}
import { periodName, seconds } from '../format.js';

function whenText(data, when) {
  if (!when) return 'いつでも';
  const parts = [];
  if (when.periods) parts.push(when.periods.map((p) => periodName(data, p)).join('・'));
  if (when.weathers) parts.push(when.weathers.map((w) => data.find('weathers', w)?.name ?? w).join('・'));
  if (when.flags || when.notFlags) parts.push('条件あり');
  return parts.join(' / ');
}

const locked = (label) => h('p', { class: 'codex-locked' }, `？？？（${label}で解放）`);

function abilityButton(ctx, type, ability, meta) {
  const kind = type === 'passive' ? 'passive' : skillKind(ability);
  return h(
    'button',
    { type: 'button', class: 'ability-row', onClick: () => ctx.go('abilityEntry', { type, abilityId: ability.id }) },
    h('span', { class: `ability-kind ability-kind-${kind}` }, ABILITY_KIND_LABEL[kind]),
    h('span', { class: 'ability-row-body' }, h('strong', {}, ability.name), h('span', { class: 'muted small' }, meta)),
    h('span', { class: 'ability-row-arrow', 'aria-hidden': 'true' }, '›'),
  );
}

export default {
  nav: 'codex',
  render(ctx, params) {
    const { data, save } = ctx;
    const e = monsterEntry(save, data, params.monsterId);
    const m = e.monster;
    const back = h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '図鑑に戻る');
    const stageList = h(
      'ol',
      { class: 'stage-track' },
      e.stages.map((s) => h('li', { class: `stage${s.done ? ' done' : ''}` }, s.name)),
    );
    const firstLocked = (key) => e.stages.find((s) => !s.done && data.balance.codex.monsterStages.concat(m.codexStages ?? []).find((x) => x.id === s.id)?.reveals.includes(key))?.name ?? '今後の段階';

    if (!e.known) {
      return h('section', {}, back, sectionTitle('？？？'), stageList, h('p', { class: 'help' }, 'まだ出会っていないモンスターです。'));
    }
    const r = e.reveals;
    const sections = [];

    sections.push(sectionTitle('出現場所'));
    if (r.has('habitat')) {
      sections.push(
        e.habitats.length
          ? h(
              'ul',
              { class: 'plain-list' },
              e.habitats.map((hb) => {
                const discovered = save.exploration.discoveredNodes.includes(hb.nodeId);
                const place = hb.dungeonId ? data.get('dungeons', hb.dungeonId).name : data.findNode(hb.nodeId)?.name;
                const tag = hb.kind === 'boss' ? '（ボス）' : '';
                return h('li', {}, discovered ? `${place}${tag}` : '？？？（未踏の場所）', h('span', { class: 'muted' }, `　${[...new Set(hb.whens.map((w) => whenText(data, w)))].join('、')}`));
              }),
            )
          : h('p', { class: 'muted' }, '決まった出現場所はない。'),
      );
    } else sections.push(locked(firstLocked('habitat')));

    sections.push(sectionTitle('能力'));
    if (r.has('stats')) {
      const el = data.find('elements', m.element);
      const weak = Object.entries(m.elementMultipliers ?? {}).filter(([, v]) => v > 1).map(([k]) => data.find('elements', k)?.name);
      const resist = Object.entries(m.elementMultipliers ?? {}).filter(([, v]) => v < 1).map(([k]) => data.find('elements', k)?.name);
      sections.push(
        h(
          'dl',
          { class: 'stat-grid' },
          [
            ['HP', m.baseStats.hp],
            ['MP', m.baseStats.mp],
            ['攻撃', m.baseStats.atk],
            ['防御', m.baseStats.def],
            ...(m.baseStats.matk != null ? [['魔法攻撃', m.baseStats.matk]] : []),
            ...(m.baseStats.mdef != null ? [['魔法防御', m.baseStats.mdef]] : []),
            ['攻撃間隔', seconds(m.baseStats.attackIntervalMs)],
            ['属性', el?.name ?? '―'],
          ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
        ),
        h('p', { class: 'muted small' }, `Lv1時点。弱点: ${weak.join('・') || 'なし'}　耐性: ${resist.join('・') || 'なし'}`),
      );
    } else sections.push(locked(firstLocked('stats')));

    sections.push(sectionTitle('落とすもの'));
    if (r.has('drops')) {
      sections.push(
        m.drops?.length
          ? h('ul', { class: 'plain-list' }, m.drops.map((d) => h('li', {}, data.get('items', d.itemId).name, h('span', { class: 'muted' }, `　${d.rate >= 0.6 ? 'よく落とす' : d.rate >= 0.25 ? 'ときどき落とす' : 'まれに落とす'}`))))
          : h('p', { class: 'muted' }, 'なし'),
      );
    } else sections.push(locked(firstLocked('drops')));

    sections.push(sectionTitle('覚える特技'));
    if (r.has('skills')) {
      sections.push(
        h(
          'ul',
          { class: 'ability-list' },
          m.learnset.map((l) => {
            const sk = data.get('skills', l.skillId);
            return h('li', {}, abilityButton(ctx, 'skill', sk, `☆${l.rank ?? 1}・Lv.${l.level}　${skillTriggerText(sk, data)}`));
          }),
        ),
      );
    } else sections.push(locked(firstLocked('skills')));

    sections.push(sectionTitle('固有パッシブ'));
    if (r.has('passives')) {
      const ps = (m.passives ?? []).map((pid) => data.find('passives', pid)).filter(Boolean);
      sections.push(ps.length ? h('ul', { class: 'ability-list' }, ps.map((p) => h('li', {}, abilityButton(ctx, 'passive', p, p.description)))) : h('p', { class: 'muted' }, 'なし'));
    } else sections.push(locked(firstLocked('passives')));

    sections.push(sectionTitle('仲間にするには'));
    if (r.has('recruit')) {
      const boss = data.list('bosses').find((b) => b.monsterId === m.id);
      sections.push(
        h('p', {}, m.recruit.special ? (boss?.recruit?.hint?.replace(/^（仮）/, '') ?? '特別な条件がある') : `倒したあとに一定の確率で仲間になる（現在の加入率 ${Math.round(recruitChance(save, data, m.id) * 100)}%）`),
      );
    } else sections.push(locked(firstLocked('recruit')));

    if (r.has('description') && m.description) sections.push(h('p', { class: 'unit-desc' }, m.description));

    const rec = e.record;
    return h(
      'section',
      {},
      back,
      h(
        'div',
        { class: 'unit-head' },
        h('img', { class: 'portrait portrait-lg', src: unitImageSrc(m, 'monster'), alt: '' }),
        h(
          'div',
          { class: 'unit-head-text' },
          h('h1', { class: 'unit-name' }, m.name),
          h('div', { class: 'unit-row-meta' }, kindBadge('monster', m), h('span', {}, data.find('worlds', m.worldId)?.name ?? '')),
          speciesNames(data, m).length ? h('p', { class: 'muted small' }, `種族 ${speciesNames(data, m).join('・')}`) : null,
          h('p', { class: 'muted small' }, `倒した数 ${rec?.counts?.defeated ?? 0}${rec?.flags?.recruited ? '　仲間にした' : ''}`),
        ),
      ),
      stageList,
      sections,
    );
  },
};
