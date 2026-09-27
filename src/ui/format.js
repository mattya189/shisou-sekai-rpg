/**
 * 画面表示用の文言。表示名や区分名はここにまとめる（IDとは無関係）。
 */
export const KIND_LABEL = { character: '人間', monster: 'モンスター' };
export const RARITY_LABEL = { normal: '通常', rare: '希少種', variant: '変異種', strong: '強敵', boss: 'ボス' };
export const ITEM_CATEGORY_LABEL = {
  material: '素材',
  consumable: '消耗品',
  growth: '育成',
  key: '重要',
};
export const STAT_LABEL = { hp: 'HP', mp: 'MP', atk: '攻撃', def: '防御', intervalPct: '攻撃間隔短縮' };

export function periodName(data, periodId) {
  return data.balance.time.periods.find((p) => p.id === periodId)?.name ?? periodId;
}

export function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}秒`;
}

/** 装備の能力を「攻撃+6」のような文字列に */
export function bonusText(stat, value) {
  const v = Math.round(value * 10) / 10;
  return stat === 'intervalPct' ? `${STAT_LABEL[stat]}${v}%` : `${STAT_LABEL[stat] ?? stat}+${v}`;
}

/** 「（仮）」を除いた頭文字（プレースホルダー画像用） */
export function initialOf(name) {
  return name.replace(/^（仮）/, '').trim().charAt(0) || '?';
}
