/**
 * セーブの読み書き。ゲームロジックはセーブの保存先を知らなくてよい。
 */
import { migrateSave } from './migrations.js';
import { normalizeSave } from './saveSchema.js';

export const DEFAULT_SAVE_KEY = 'shisou-sekai-rpg/save';

export class SaveLoadError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SaveLoadError';
    this.cause = cause;
  }
}

export class SaveRepository {
  /**
   * @param {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void }} storage
   * @param {{ key?: string, migrations?: any[], currentVersion?: number, now?: () => string }} [opts]
   */
  constructor(storage, opts = {}) {
    this.storage = storage;
    this.key = opts.key ?? DEFAULT_SAVE_KEY;
    this.migrateOpts = { migrations: opts.migrations, currentVersion: opts.currentVersion };
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  hasSave() {
    return this.storage.getItem(this.key) !== null;
  }

  /** @returns {any | null} セーブが無ければ null */
  load() {
    const text = this.storage.getItem(this.key);
    if (text === null) return null;
    return this.parse(text);
  }

  /** 文字列からセーブを復元する（インポートにも使う） */
  parse(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new SaveLoadError('セーブデータが壊れています（JSONとして読めません）', e);
    }
    if (!raw || typeof raw !== 'object') throw new SaveLoadError('セーブデータの形式が不正です');
    const opts = Object.fromEntries(Object.entries(this.migrateOpts).filter(([, v]) => v !== undefined));
    try {
      return normalizeSave(migrateSave(raw, opts));
    } catch (e) {
      throw new SaveLoadError(e.message, e);
    }
  }

  save(save) {
    save.updatedAt = this.now();
    if (!save.createdAt) save.createdAt = save.updatedAt;
    this.storage.setItem(this.key, JSON.stringify(save));
  }

  /** 読めなかったセーブを別キーに退避してから消す */
  backupAndClear() {
    const text = this.storage.getItem(this.key);
    if (text !== null) this.storage.setItem(`${this.key}/broken-backup`, text);
    this.clear();
  }

  clear() {
    this.storage.removeItem(this.key);
  }

  exportText(save) {
    return JSON.stringify(save, null, 2);
  }
}
