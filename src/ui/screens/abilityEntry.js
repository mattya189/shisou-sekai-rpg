/** 特技・パッシブ共通の図鑑詳細。params: { type, abilityId } */
import { h } from '../dom.js';
import { sectionTitle } from '../components.js';
import { abilityDetail, ABILITY_KIND_LABEL, skillActionCountText } from '../../codex/abilities.js';
import { monsterEntry } from '../../codex/codex.js';

function detailRow(label, value) {
  if (value == null || value === '') return null;
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}

function learningText(user) {
  return user.rank == null ? '固有能力' : `☆${user.rank}以上 かつ Lv.${user.level}以上`;
}

export default {
  nav: 'codex',
  render(ctx, params) {
    const { data, save } = ctx;
    const detail = abilityDetail(data, params.type, params.abilityId);
    const back = h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '戻る');
    if (!detail) return h('section', {}, back, sectionTitle('能力が見つかりません'));

    const ability = detail.ability;
    const basicRows = [
      detailRow('分類', ABILITY_KIND_LABEL[detail.kind]),
      detail.type === 'skill' ? detailRow('消費MP', ability.mpCost ?? 0) : null,
      detail.type === 'skill' ? detailRow('発動条件', detail.triggerText) : null,
      detail.type === 'skill' && ability.oncePerBattle ? detailRow('使用制限', '1戦闘につき1回') : null,
      detail.type === 'skill' && ability.element ? detailRow('属性', data.find('elements', ability.element)?.name ?? ability.element) : null,
      detail.type === 'skill' ? detailRow('攻撃回数', skillActionCountText(ability)) : null,
    ].filter(Boolean);

    const users = detail.users.map((user) => {
      const entry = monsterEntry(save, data, user.monsterId);
      return h(
        'li',
        { class: 'ability-user' },
        h(
          'button',
          {
            type: 'button',
            class: 'ability-user-link',
            disabled: !entry.known,
            onClick: () => ctx.go('monsterEntry', { monsterId: user.monsterId }),
          },
          h('span', { class: 'ability-user-name' }, entry.known ? user.monster.name.replace(/^（仮）/, '') : '？？？'),
          h('span', { class: 'muted small' }, entry.known ? learningText(user) : '未発見'),
        ),
      );
    });

    return h(
      'section',
      { class: 'ability-detail-screen' },
      back,
      sectionTitle(detail.name, ABILITY_KIND_LABEL[detail.kind]),
      h('dl', { class: 'ability-kv' }, basicRows),
      ability.description ? h('p', { class: 'ability-description' }, ability.description) : null,
      sectionTitle('実際の効果'),
      detail.effects.length
        ? h('ul', { class: 'ability-effect-list' }, detail.effects.map((text) => h('li', {}, text)))
        : h('p', { class: 'muted' }, '起点となる能力の発動に連動します。'),
      detail.statuses.length
        ? [
            sectionTitle('関連する状態'),
            h('div', { class: 'ability-related-list' }, detail.statuses.map((status) => h(
              'article', { class: 'ability-related-card' },
              h('strong', {}, status.name),
              status.durationText ? h('span', { class: 'badge' }, status.durationText) : null,
              h('p', {}, status.description),
            ))),
          ]
        : null,
      detail.markers.length
        ? [
            sectionTitle('関連するスタック'),
            h('div', { class: 'ability-related-list' }, detail.markers.map((marker) => h(
              'article', { class: 'ability-related-card' },
              h('strong', {}, marker.name),
              h('span', { class: 'badge' }, `上限 ${marker.maxStacks}`),
              h('p', {}, marker.description),
            ))),
          ]
        : null,
      sectionTitle('使用・習得モンスター'),
      users.length ? h('ul', { class: 'ability-user-list' }, users) : h('p', { class: 'muted' }, '現在、モンスターの習得データはありません。'),
    );
  },
};
