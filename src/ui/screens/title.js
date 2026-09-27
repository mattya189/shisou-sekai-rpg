import { h } from '../dom.js';
import { SaveLoadError } from '../../save/saveRepository.js';
import { isInTown } from '../../exploration/map.js';

export default {
  nav: null,
  chrome: false,
  render(ctx, params, state) {
    const { session } = ctx;
    const hasSave = session.hasSave();

    const cont = () => {
      try {
        const save = session.continueGame();
        ctx.go(save.dungeonRun ? 'dungeon' : isInTown(save) ? 'town' : 'location', {}, { reset: true });
      } catch (e) {
        if (!(e instanceof SaveLoadError)) throw e;
        state.error = e.message;
        ctx.rerender();
      }
    };
    const start = () => {
      if (hasSave && !state.confirmNew) {
        state.confirmNew = true;
        ctx.rerender();
        return;
      }
      session.startNewGame();
      ctx.go('town', {}, { reset: true });
    };
    const discardBroken = () => {
      session.repo.backupAndClear();
      state.error = null;
      ctx.toast('読めなかったセーブを退避しました');
      ctx.rerender();
    };

    return h(
      'section',
      { class: 'title-screen' },
      h('h1', { class: 'title-mark' }, '思想世界RPG'),
      h('p', { class: 'title-sub' }, 'プロトタイプ v0.1'),
      state.error
        ? h(
            'div',
            { class: 'notice notice-error' },
            h('p', {}, state.error),
            h('button', { class: 'btn', type: 'button', onClick: discardBroken }, 'セーブを退避して最初から'),
          )
        : null,
      h(
        'div',
        { class: 'title-actions' },
        hasSave ? h('button', { class: 'btn btn-primary', type: 'button', onClick: cont }, '続きから') : null,
        state.confirmNew
          ? h('p', { class: 'notice' }, '今のセーブを消して最初から始めます。もう一度押すと開始します。')
          : null,
        h('button', { class: hasSave ? 'btn' : 'btn btn-primary', type: 'button', onClick: start }, state.confirmNew ? 'セーブを消して始める' : 'はじめから'),
      ),
    );
  },
};
