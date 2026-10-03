/**
 * 通常の行動選択とは別に、戦闘中の出来事へ反応して即時発動する特技条件。
 * 特定モンスター名ではなく、データの immediateTrigger.type で登録する。
 */
export const EVENT_TRIGGERS = {
  normalAttack: {
    params: ['chance'],
    matches(p, c) { return c.event.type === 'normalAttack' && c.event.target === c.actor && c.rng.chance(p.chance); },
  },
  enemyDebuff: {
    params: ['chance'],
    matches(p, c) { return c.event.type === 'enemyDebuff' && c.event.target === c.actor && c.event.source?.side !== c.actor.side && c.rng.chance(p.chance); },
  },
  markerThresholdReached: {
    params: ['markerId', 'thresholds'],
    matches(p, c) {
      if (c.event.type !== 'markerChanged' || c.event.target !== c.actor || c.event.markerId !== p.markerId) return false;
      if (c.event.after <= c.event.before) return false;
      // 1回のスタック変化につき特技は1回だけ。減少後の再到達では再び発動できる。
      return p.thresholds.some((n) => c.event.before < n && c.event.after >= n);
    },
  },
  damaged: {
    params: ['chance'],
    matches(p, c) {
      return c.event.type === 'damaged'
        && c.event.target === c.actor
        && c.event.source?.side !== c.actor.side
        && c.rng.chance(p.chance);
    },
  },
  hpThresholdCrossed: {
    params: ['pct'],
    matches(p, c) {
      return c.event.type === 'damaged' && c.event.target === c.actor
        && c.event.beforePct > p.pct && c.event.afterPct <= p.pct;
    },
  },
};

export function validateEventTrigger(trigger, where = 'immediateTrigger') {
  if (!trigger) return [];
  const def = EVENT_TRIGGERS[trigger.type];
  if (!def) return [`${where}.type "${trigger.type}" は未登録の即時発動条件です（src/battle/eventTriggers.js）`];
  const errors = def.params
    .filter((p) => trigger[p] === undefined)
    .map((p) => `${where}: 条件 ${trigger.type} にはパラメータ ${p} が必要です`);
  if (['damaged', 'normalAttack', 'enemyDebuff'].includes(trigger.type) && !(trigger.chance >= 0 && trigger.chance <= 1)) errors.push(`${where}.chance は0〜1で指定してください`);
  if (trigger.type === 'hpThresholdCrossed' && !(trigger.pct > 0 && trigger.pct < 100)) errors.push(`${where}.pct は0より大きく100未満にしてください`);
  if (trigger.type === 'markerThresholdReached' && !(Array.isArray(trigger.thresholds) && trigger.thresholds.every((n) => Number.isInteger(n) && n > 0))) {
    errors.push(`${where}.thresholds は正の整数配列で指定してください`);
  }
  return errors;
}
