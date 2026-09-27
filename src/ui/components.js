/**
 * 複数の画面で使う部品。
 */
import { h } from './dom.js';
import { unitImageSrc } from './placeholder.js';
import { KIND_LABEL, RARITY_LABEL } from './format.js';

export function portrait(def, kind, size = 'md') {
  return h('img', { class: `portrait portrait-${size}`, src: unitImageSrc(def, kind), alt: '' });
}

export function kindBadge(kind, def) {
  const extra = kind === 'monster' && def.rarity && def.rarity !== 'normal' ? RARITY_LABEL[def.rarity] : null;
  return h(
    'span',
    { class: 'badges' },
    h('span', { class: `badge badge-${kind}` }, KIND_LABEL[kind]),
    extra ? h('span', { class: 'badge badge-rarity' }, extra) : null,
  );
}

/**
 * ユニット1体の行。
 * @param {{ def: any, unit: any, kind: string, stats: any, onClick?: () => void, aside?: any }} p
 */
export function unitRow({ def, unit, kind, stats, onClick, aside }) {
  const Tag = onClick ? 'button' : 'div';
  return h(
    Tag,
    { class: 'unit-row', onClick, type: onClick ? 'button' : undefined },
    portrait(def, kind),
    h(
      'span',
      { class: 'unit-row-body' },
      h('span', { class: 'unit-row-name' }, def.name),
      h('span', { class: 'unit-row-meta' }, kindBadge(kind, def), h('span', {}, `Lv.${unit.level}`), h('span', {}, `ランク${unit.rank}`)),
      stats
        ? h('span', { class: 'unit-row-stats' }, `HP ${stats.hp}　MP ${stats.mp}　攻撃 ${stats.atk}　防御 ${stats.def}`)
        : null,
    ),
    aside ? h('span', { class: 'unit-row-aside' }, aside) : null,
  );
}

export function sectionTitle(text, note) {
  return h('h2', { class: 'section-title' }, text, note ? h('span', { class: 'section-note' }, note) : null);
}

export function emptyState(text) {
  return h('p', { class: 'empty' }, text);
}
