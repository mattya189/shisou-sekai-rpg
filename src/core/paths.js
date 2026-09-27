/**
 * データ内の値をパス文字列で集める小さなヘルパー。
 * 参照チェック（schema.js）で使う。
 *
 *   "worldId"               → obj.worldId
 *   "passives[]"            → obj.passives の各要素
 *   "learnset[].skillId"    → obj.learnset の各要素の skillId
 *   "elementMultipliers{}"  → obj.elementMultipliers のキー一覧
 *   "trigger.of[].statusId" → ネストも可
 */
export function collectValues(obj, path) {
  let current = [obj];
  for (const token of path.split('.')) {
    const match = token.match(/^([^[{]+)(\[\]|\{\})?$/);
    if (!match) throw new Error(`パスの書式が不正です: ${path}`);
    const [, key, mod] = match;
    const next = [];
    for (const c of current) {
      if (c == null || typeof c !== 'object') continue;
      const v = c[key];
      if (v === undefined || v === null) continue;
      if (mod === '[]') {
        if (Array.isArray(v)) next.push(...v);
      } else if (mod === '{}') {
        if (typeof v === 'object') next.push(...Object.keys(v));
      } else {
        next.push(v);
      }
    }
    current = next;
  }
  return current.filter((v) => v !== undefined && v !== null);
}
