/**
 * ゲームデータ（data/ 以下のJSON）の読み込みと参照の窓口。
 *
 * ゲームのロジックは必ずこのクラス経由でコンテンツを参照する。
 * JSONファイルを直接 import しないこと（ファイル分割・追加に対応できなくなるため）。
 */
import { validateGameData } from './schema.js';

/**
 * @param {(path: string) => Promise<any>} readJson ブラウザでは fetch、テストでは fs を渡す
 * @param {string} basePath 例: "data/"
 */
export async function loadGameData(readJson, basePath = 'data/') {
  const manifest = await readJson(`${basePath}manifest.json`);
  const raw = {};
  for (const [category, files] of Object.entries(manifest.categories ?? {})) {
    raw[category] = [];
    for (const file of files) {
      const list = await readJson(`${basePath}${file}`);
      if (!Array.isArray(list)) throw new Error(`${file} は配列である必要があります`);
      raw[category].push(...list);
    }
  }
  for (const [name, file] of Object.entries(manifest.singletons ?? {})) {
    raw[name] = await readJson(`${basePath}${file}`);
  }
  return new GameData(raw);
}

export class GameData {
  /** @param {Record<string, any>} raw */
  constructor(raw) {
    this.raw = raw;
    this.balance = raw.balance;
    /** @type {Record<string, Map<string, any>>} */
    this.index = {};
    for (const [category, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      const map = new Map();
      for (const entry of list) {
        if (entry?.id && !map.has(entry.id)) map.set(entry.id, entry);
      }
      this.index[category] = map;
    }
  }

  /** 見つからなければ例外。存在が前提の参照に使う。 */
  get(category, id) {
    const entry = this.index[category]?.get(id);
    if (!entry) throw new Error(`データが見つかりません: ${category} / ${id}`);
    return entry;
  }

  /** 見つからなければ null */
  find(category, id) {
    return this.index[category]?.get(id) ?? null;
  }

  has(category, id) {
    return this.index[category]?.has(id) ?? false;
  }

  /** @returns {any[]} */
  list(category) {
    return this.raw[category] ?? [];
  }

  /**
   * 人間キャラクターとモンスターを同じ扱いで引く。
   * @returns {{ kind: 'character' | 'monster', def: any } | null}
   */
  findUnitDef(defId) {
    const chr = this.find('characters', defId);
    if (chr) return { kind: 'character', def: chr };
    const mon = this.find('monsters', defId);
    if (mon) return { kind: 'monster', def: mon };
    return null;
  }

  getUnitDef(defId) {
    const found = this.findUnitDef(defId);
    if (!found) throw new Error(`ユニット定義が見つかりません: ${defId}`);
    return found;
  }

  /** 街または地点 */
  findNode(id) {
    return this.find('towns', id) ?? this.find('locations', id);
  }

  qualityIds() {
    return this.balance.qualities.map((q) => q.id);
  }

  qualityName(qualityId) {
    return this.balance.qualities.find((q) => q.id === qualityId)?.name ?? qualityId;
  }

  validate() {
    return validateGameData(this.raw);
  }
}
