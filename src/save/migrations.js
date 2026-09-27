/**
 * セーブデータのマイグレーション。
 *
 * セーブの既存項目の「形」を変えるときだけ、ここに1件追加する。
 * 項目の追加だけなら saveSchema.js の初期値追加で足りる（自動補完されるため）。
 *
 * 例:
 *   {
 *     from: 1, to: 2,
 *     description: 'party を配列からオブジェクトに変更',
 *     migrate(save) { save.party = { main: save.party }; return save; },
 *   },
 */
import { CURRENT_SAVE_VERSION } from './saveSchema.js';

export const MIGRATIONS = [];

export class SaveVersionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SaveVersionError';
  }
}

/**
 * @param {any} raw
 * @param {{ migrations?: typeof MIGRATIONS, currentVersion?: number }} [opts]
 */
export function migrateSave(raw, { migrations = MIGRATIONS, currentVersion = CURRENT_SAVE_VERSION } = {}) {
  let save = structuredClone(raw);
  let version = Number.isInteger(save.saveVersion) ? save.saveVersion : 0;
  if (version > currentVersion) {
    throw new SaveVersionError(
      `セーブデータ（v${version}）がこのゲーム（v${currentVersion}）より新しいため読み込めません`,
    );
  }
  while (version < currentVersion) {
    const step = migrations.find((m) => m.from === version);
    if (!step) throw new SaveVersionError(`v${version} からのマイグレーションがありません`);
    save = step.migrate(save);
    version = step.to;
    save.saveVersion = version;
  }
  return save;
}
