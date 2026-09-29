import { h } from '../dom.js';
import { openFacility } from '../facilities.js';

export default {
  nav: 'home',
  render(ctx) {
    const { data, save } = ctx;
    const town = data.get('towns', save.exploration.townId);
    const world = data.get('worlds', town.worldId);

    const hero = h(
      'div',
      { class: 'town-hero', style: town.background ? { backgroundImage: `url(${town.background})` } : undefined },
      h('p', { class: 'world-theme', 'aria-label': `世界のテーマ: ${world.theme}` }, world.theme),
      h('div', { class: 'town-hero-names' }, h('p', { class: 'world-name' }, world.name), h('h1', { class: 'town-name' }, town.name)),
    );

    const facilities = h(
      'div',
      { class: 'facility-grid' },
      town.facilities.map((f) =>
        h(
          'button',
          { type: 'button', class: `facility facility-${f.type}`, onClick: () => openFacility(ctx, f, town) },
          f.name,
        ),
      ),
    );

    return h('section', { class: 'town-screen' }, hero, facilities);
  },
};
