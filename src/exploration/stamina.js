import { GameError } from '../core/errors.js';

/** スタミナをセーブ時刻から同期する。setInterval が止まっていても同じ計算になる。 */
export function syncStamina(save, data, now = Date.now()) {
  const ex = save.exploration;
  const cap = data.balance.actionPoints.cap;
  const intervalMs = data.balance.actionPoints.recoverySeconds * 1000;
  const before = Number.isFinite(ex.actionPoints) ? ex.actionPoints : 0;
  ex.maxActionPoints = cap;
  ex.actionPoints = Math.max(0, Math.min(cap, before));

  if (!Number.isFinite(ex.staminaUpdatedAt)) {
    ex.staminaUpdatedAt = now;
    return { recovered: 0, changed: true, nextRecoveryMs: ex.actionPoints >= cap ? null : intervalMs };
  }
  if (now < ex.staminaUpdatedAt) ex.staminaUpdatedAt = now;
  if (ex.actionPoints >= cap) {
    return { recovered: 0, changed: ex.actionPoints !== before, nextRecoveryMs: null };
  }

  const elapsed = now - ex.staminaUpdatedAt;
  const available = Math.floor(elapsed / intervalMs);
  const recovered = Math.min(available, cap - ex.actionPoints);
  if (recovered > 0) {
    ex.actionPoints += recovered;
    if (ex.actionPoints >= cap) ex.staminaUpdatedAt = now;
    else ex.staminaUpdatedAt += recovered * intervalMs;
  }
  const nextRecoveryMs = ex.actionPoints >= cap ? null : Math.max(0, intervalMs - (now - ex.staminaUpdatedAt));
  return { recovered, changed: recovered > 0 || ex.actionPoints !== before, nextRecoveryMs };
}

/** 実際の行動時だけスタミナを消費する。満タンからの消費はその時点から回復を数える。 */
export function spendStamina(save, data, amount, now = Date.now()) {
  syncStamina(save, data, now);
  const wasFull = save.exploration.actionPoints >= data.balance.actionPoints.cap;
  if (save.exploration.actionPoints < amount) {
    throw new GameError('not_enough_ap', `スタミナが足りません（必要 ${amount}）`);
  }
  save.exploration.actionPoints -= amount;
  if (wasFull) save.exploration.staminaUpdatedAt = now;
  return save.exploration.actionPoints;
}

export function staminaStatus(save, data, now = Date.now()) {
  const synced = syncStamina(save, data, now);
  return {
    current: save.exploration.actionPoints,
    max: save.exploration.maxActionPoints,
    nextRecoveryMs: synced.nextRecoveryMs,
    recovered: synced.recovered,
    changed: synced.changed,
  };
}

export function formatRecovery(ms) {
  if (ms === null) return 'MAX';
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
