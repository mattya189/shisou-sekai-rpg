/**
 * アイテム図鑑の詳細（品質ごとの入手状況・入手方法の逆引き）。params: { itemId }
 */
import { h } from '../dom.js';
import { sectionTitle } from '../components.js';
import { itemEntry } from '../../codex/codex.js';
import { hasMonsterFlag } from '../../progression/codex.js';
import { ITEM_CATEGORY_LABEL, periodName } from '../format.js';

const KIND_LABEL = {
  gather: '採取',
  secret: '調査',
  drop: 'ドロップ',
  boss: 'ボス',
  shop: '購入',
  recipe: '製作',
  event: 'イベント',
  duplicate: '仲間の重複',
};

function whenText(data, when) {
  if (!when) return '';
  const parts = [];
  if (when.periods) parts.push(when.periods.map((p) => periodName(data, p)).join('・'));
  if (when.weathers) parts.push(when.weathers.map((w) => data.find('weathers', w)?.name ?? w).join('・'));
  return parts.length ? `（${parts.join(' / ')}）` : '';
}

export default {
  nav: 'codex',
  render(ctx, params) {
    const { data, save } = ctx;
    const e = itemEntry(save, data, params.itemId);
    const back = h('button', { type: 'button', class: 'back-link', onClick: () => ctx.back() }, '図鑑に戻る');
    if (!e.known) return h('section', {}, back, sectionTitle('？？？'), h('p', { class: 'help' }, 'まだ手に入れていないアイテムです。'));

    const placeName = (nodeId) => (save.exploration.discoveredNodes.includes(nodeId) ? data.findNode(nodeId)?.name : '？？？（未踏の場所）');
    const monsterName = (id) => (hasMonsterFlag(save, id, 'encountered') ? data.get('monsters', id).name : '？？？（未遭遇のモンスター）');
    const sourceText = (s) => {
      switch (s.kind) {
        case 'gather':
        case 'secret':
          return `${placeName(s.nodeId)}${whenText(data, s.when)}`;
        case 'drop':
        case 'duplicate':
        case 'boss':
          return monsterName(s.monsterId);
        case 'shop':
          return data.get('shops', s.sourceId).name;
        case 'recipe':
          return `工房「${data.get('recipes', s.sourceId).name}」`;
        case 'event':
          return s.nodeId ? `${placeName(s.nodeId)}での出来事` : '出来事';
        default:
          return s.sourceId;
      }
    };

    return h(
      'section',
      {},
      back,
      sectionTitle(e.item.name, ITEM_CATEGORY_LABEL[e.item.category]),
      e.item.description ? h('p', { class: 'help' }, e.item.description) : null,
      e.qualities.length
        ? [
            sectionTitle('品質の入手状況'),
            h('ul', { class: 'quality-list' }, e.qualities.map((q) => h('li', { class: `quality quality-${q.id}${q.obtained ? '' : ' missing'}` }, q.obtained ? q.name : '？？？'))),
          ]
        : null,
      sectionTitle('入手方法'),
      e.sources.length
        ? h(
            'ul',
            { class: 'plain-list source-list' },
            e.sources.map((s) => h('li', { class: s.found ? 'found' : '' }, h('span', { class: 'badge' }, KIND_LABEL[s.kind] ?? s.kind), ` ${sourceText(s)}`, s.found ? h('span', { class: 'muted' }, '　入手済み') : null)),
          )
        : h('p', { class: 'muted' }, '入手方法の記録はありません。'),
    );
  },
};
