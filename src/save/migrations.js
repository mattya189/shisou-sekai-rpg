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

export const MIGRATIONS = [
  {
    from: 1,
    to: 2,
    description: '冒険先選択と最大300の時間回復スタミナへ移行',
    migrate(save) {
      const exploration = save.exploration && typeof save.exploration === 'object' ? save.exploration : (save.exploration = {});
      const oldMax = Number.isFinite(exploration.maxActionPoints) ? exploration.maxActionPoints : 6;
      const oldValue = Number.isFinite(exploration.actionPoints) ? exploration.actionPoints : oldMax;
      // 旧仕様で満タンだったセーブは、新上限でも満タンとして引き継ぐ。
      exploration.actionPoints = oldValue >= oldMax ? 300 : Math.max(0, Math.min(300, oldValue));
      exploration.maxActionPoints = 300;
      exploration.adventureId = exploration.adventureId ?? exploration.locationId ?? null;
      exploration.staminaUpdatedAt = null;
      // locationId は旧セーブ互換のため残すが、v2以降のUIは現在地として使わない。
      return save;
    },
  },
];

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
