/**
 * 出現条件（when）の判定。エンカウント・採取・隠し要素で共通。
 *
 *   { "periods": ["night"], "weathers": ["weather_003"], "flags": ["flag_001"], "notFlags": ["flag_002"] }
 *   書いた項目をすべて満たすときだけ有効。項目を省略すればその条件はなし。
 */
export function matchesWhen(when, { period, weatherId, flags = {} }) {
  if (!when) return true;
  if (when.periods && !when.periods.includes(period)) return false;
  if (when.weathers && !when.weathers.includes(weatherId)) return false;
  if (when.flags && !when.flags.every((f) => flags[f])) return false;
  if (when.notFlags && when.notFlags.some((f) => flags[f])) return false;
  return true;
}
