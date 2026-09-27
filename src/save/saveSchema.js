/**
 * セーブデータの形と、欠けている項目の補完。
 *
 * 項目を追加するときは:
 *   1. createEmptySave() に初期値を追加する（古いセーブにも自動で補完される）
 *   2. 既存の値を別の形に変える場合だけ、migrations.js にマイグレーションを追加し
 *      CURRENT_SAVE_VERSION を上げる
 * 詳しくは docs/save-data.md
 */

export const CURRENT_SAVE_VERSION = 1;

export function createEmptySave() {
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    createdAt: null,
    updatedAt: null,
    /** 装備個体などに振る通し番号 */
    nextUid: 1,
    /** 所持ユニット。キーはユニット定義ID（chr_001 / mon_001）。同種は1体のみ。 */
    units: {},
    /** 編成。ユニット定義IDまたは null。長さは balance.party.size */
    party: [null, null, null, null],
    inventory: {
      /** { item_001: { q1: 32, q2: 18 } } */
      items: {},
      /** { eq_1: { uid, defId, plus, randomStats } } */
      equipment: {},
      /** { cur_001: 500 } */
      currencies: {},
    },
    codex: {
      /** { mon_001: { flags: { encountered: true, ... }, counts: { defeated: 3 } } } */
      monsters: {},
      /** { item_001: { qualities: { q1: true } } } */
      items: {},
    },
    exploration: {
      worldId: null,
      townId: null,
      locationId: null,
      discoveredNodes: [],
      actionPoints: 6,
      maxActionPoints: 6,
      /** tick は時間帯の中の経過（balance.time.ticksPerPeriod で次の時間帯へ） */
      time: { day: 1, period: 'morning', tick: 0 },
      /** { region_001: 'sunny' } Phase 4 で使用 */
      weather: {},
    },
    recruit: {
      /** { mon_001: 3 } 加入失敗の蓄積回数 */
      failCounts: {},
    },
    /** 汎用フラグ。イベント進行などに使う。 */
    flags: {},
    /** イベントの発生回数 { event_002: 1 } */
    events: { seen: {} },
    /** 進行中のダンジョン（null なら入っていない）{ dungeonId, stage, mp: { unitId: 値 } } */
    dungeonRun: null,
    /** ダンジョンの踏破回数 { dgn_001: 1 } */
    dungeons: { cleared: {} },
    /** プレイヤーの設定 */
    settings: {
      /** 戦闘速度（balance.battle.speeds のいずれか） */
      battleSpeed: 1,
    },
  };
}

export function createUnitDefaults() {
  return {
    defId: null,
    kind: null,
    level: 1,
    exp: 0,
    rank: 1,
    /** 現在HP。null は満タン。フィールドでは戦闘後も持ち越し、宿屋で回復する */
    currentHp: null,
    /** 戦闘用にセットした特技。並び順＝優先順位（先頭が最優先） */
    equippedSkills: [],
    /** レベル以外の手段で覚えた特技（将来用） */
    extraSkills: [],
    /** 装備個体のuid。長さは balance.equipment.slots */
    equipment: [null, null],
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** defaults にあって target に無い項目を補う（target 側の値を優先） */
export function fillDefaults(target, defaults) {
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [k, dv] of Object.entries(defaults)) {
    if (out[k] === undefined) {
      out[k] = structuredClone(dv);
    } else if (isPlainObject(dv)) {
      // JSONとして読めても、入れ子のオブジェクトが文字列や配列に壊れている
      // セーブがある。既定値と同じ型へ戻し、後続画面での例外を防ぐ。
      out[k] = isPlainObject(out[k]) ? fillDefaults(out[k], dv) : structuredClone(dv);
    } else if (Array.isArray(dv) && !Array.isArray(out[k])) {
      out[k] = structuredClone(dv);
    }
  }
  return out;
}

/**
 * 読み込んだセーブの欠けた項目を補完する。
 * 未知の項目は消さずに残す（新しいバージョンで追加された項目を壊さないため）。
 */
export function normalizeSave(save) {
  const out = fillDefaults(save, createEmptySave());
  const unitDefaults = createUnitDefaults();
  for (const [id, unit] of Object.entries(out.units)) {
    out.units[id] = fillDefaults(unit, { ...unitDefaults, defId: id });
  }
  // dungeonRun は通常 null のため fillDefaults だけでは型を判定できない。
  // 壊れた途中経過は破棄するが、ほかの進行状況は維持する。
  if (out.dungeonRun !== null && !isPlainObject(out.dungeonRun)) out.dungeonRun = null;
  if (isPlainObject(out.dungeonRun)) {
    out.dungeonRun = fillDefaults(out.dungeonRun, { dungeonId: null, stage: 0, mp: {} });
  }
  return out;
}
