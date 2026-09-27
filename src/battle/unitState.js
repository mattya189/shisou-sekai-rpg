/**
 * 戦闘中ユニットの状態を読む小さな関数（依存なし）。
 * 条件・パッシブ・エンジンの全員が使うので、循環importを避けるため独立させている。
 */

/** 現在HPの割合（0〜100） */
export function hpPct(unit) {
  return unit.maxHp > 0 ? (unit.hp / unit.maxHp) * 100 : 0;
}

/** statusId を省略すると「何らかの状態異常にかかっているか」 */
export function hasStatus(unit, statusId) {
  return statusId ? unit.statuses.some((s) => s.statusId === statusId) : unit.statuses.length > 0;
}
