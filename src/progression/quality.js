/**
 * 品質の抽選。balance.qualities の weight が基本の出やすさ。
 * bonus（天候・地点・行動による補正）が大きいほど高品質が出やすくなる:
 *   品質 i（0始まり）の重み = weight × (1 + bonus × i)
 */
export function rollQuality(data, rng, bonus = 0) {
  const entries = data.balance.qualities.map((q, i) => ({ id: q.id, weight: q.weight * (1 + Math.max(0, bonus) * i) }));
  return rng.weighted(entries)?.id ?? entries[0].id;
}

/** 品質による効果倍率（消耗品の回復量など） */
export function qualityMultiplier(data, qualityId) {
  return data.balance.qualities.find((q) => q.id === qualityId)?.effectMultiplier ?? 1;
}
