/**
 * データ全体で共有する定数（依存なし）。
 */
/** IDは「英小文字の接頭辞_数字3桁以上」。表示名をIDにしないこと。 */
export const ID_PATTERN = /^[a-z]+_\d{3,}$/;

export const ITEM_CATEGORIES = ['consumable', 'material', 'growth', 'key'];
export const UNIT_STAT_KEYS = ['hp', 'mp', 'atk', 'def'];
export const EQUIPMENT_STAT_KEYS = ['hp', 'mp', 'atk', 'def', 'intervalPct'];
/** フラグ名の形式（イベント・隠し要素の進行管理に使う） */
export const FLAG_PATTERN = /^flag_\d{3,}$/;
