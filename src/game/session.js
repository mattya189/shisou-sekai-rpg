/**
 * 遊んでいる最中の状態（データ・セーブ・乱数）をまとめて持つ。
 * 画面は session.save を読み、ロジック関数で書き換えたあと session.commit() を呼ぶ。
 */
import { createRng } from '../core/rng.js';
import { createNewGame } from './newGame.js';

export class Session {
  /**
   * @param {import('../core/gameData.js').GameData} data
   * @param {import('../save/saveRepository.js').SaveRepository} repo
   * @param {{ seed?: number }} [opts]
   */
  constructor(data, repo, opts = {}) {
    this.data = data;
    this.repo = repo;
    this.rng = createRng(opts.seed);
    /** @type {any} */
    this.save = null;
    this.listeners = new Set();
  }

  hasSave() {
    return this.repo.hasSave();
  }

  continueGame() {
    this.save = this.repo.load();
    return this.save;
  }

  startNewGame() {
    this.save = createNewGame(this.data, this.rng);
    this.commit();
    return this.save;
  }

  /** 変更を保存し、購読者（画面）に通知する */
  commit() {
    if (!this.save) return;
    this.repo.save(this.save);
    for (const fn of this.listeners) fn(this.save);
  }

  /** @param {(save: any) => void} fn */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** セーブを消してタイトルに戻れる状態にする */
  resetSave() {
    this.repo.clear();
    this.save = null;
  }
}
