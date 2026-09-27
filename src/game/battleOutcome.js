/**
 * 戦闘結果をセーブに反映する（DOMに依存しない）。
 *
 *   勝利   : HPの反映、経験値（生き残った味方全員に全額）、ゴールド、ドロップ（品質抽選）、加入判定
 *   敗北   : 最後にいた街へ戻り、編成メンバーのHPが balance.defeat.hpAfterDefeat になる
 *   時間切れ: HPの反映のみ（撤退扱い、報酬なし）
 * どの結果でも、図鑑用に「遭遇」「撃破」を記録する。
 *
 * 経験値 = モンスターの exp × (1 + (レベル-1) × rewards.expLevelScale)  （ゴールドも同様）
 */
import { battleResult, sideOf } from '../battle/engine.js';
import { markMonster, countMonster } from '../progression/codex.js';
import { setCurrentHp } from '../progression/hp.js';
import { addExp } from '../progression/leveling.js';
import { addItem, addCurrency } from '../progression/inventory.js';
import { rollQuality } from '../progression/quality.js';
import { partyMembers } from '../progression/party.js';
import { returnToTown } from '../exploration/map.js';
import { recruitAfterBattle } from './recruit.js';
import { grantUnit } from '../progression/units.js';

/**
 * ボスの特殊加入条件（bosses.json の recruit.conditions）。新しい種類はここに追加する。
 * info: battleResult().bosses の要素 + { timeMs, alliesAlive }
 */
export const BOSS_RECRUIT_CONDITIONS = {
  breakCount: (c, info) => info.breakCount >= (c.min ?? 1),
  partsDestroyed: (c, info) => info.partsDestroyed >= (c.min ?? 1),
  withinMs: (c, info) => info.timeMs <= c.ms,
  noAllyDown: (c, info) => info.alliesDown === 0,
};

/**
 * @param {{ applyHp?: boolean, rewards?: boolean }} [opts]
 */
export function applyBattleOutcome(save, data, battle, rng, { applyHp = true, rewards = true } = {}) {
  const result = battleResult(battle);
  const b = data.balance;
  const summary = {
    outcome: result.outcome,
    exp: [],
    gold: 0,
    drops: [],
    recruits: [],
    returnedToTown: false,
  };

  const enemies = sideOf(battle, 'enemy').filter((e) => !e.isPart);
  const defeated = enemies.filter((e) => !e.alive);
  for (const e of enemies) markMonster(save, e.defId, 'encountered');
  for (const e of defeated) {
    markMonster(save, e.defId, 'defeated');
    countMonster(save, e.defId, 'defeated');
  }

  if (applyHp) {
    for (const a of result.allies) if (a.unitId && save.units[a.unitId]) setCurrentHp(save, data, a.unitId, a.hp);
  }

  if (result.outcome === 'won' && rewards) {
    let exp = 0;
    let gold = 0;
    for (const e of defeated) {
      const def = data.get('monsters', e.defId);
      exp += Math.round((def.exp ?? 0) * (1 + (e.level - 1) * b.rewards.expLevelScale));
      gold += Math.round((def.gold ?? 0) * (1 + (e.level - 1) * b.rewards.goldLevelScale));
    }
    for (const a of result.allies) {
      if (!a.alive || !a.unitId || !save.units[a.unitId]) continue;
      const before = save.units[a.unitId].level;
      const r = addExp(save, data, a.unitId, exp);
      summary.exp.push({ unitId: a.unitId, amount: exp, fromLevel: before, toLevel: save.units[a.unitId].level, learned: r.learned });
    }
    if (gold > 0) addCurrency(save, data, b.goldCurrencyId, gold);
    summary.gold = gold;

    const dropMap = new Map();
    for (const e of defeated) {
      const def = data.get('monsters', e.defId);
      for (const d of def.drops ?? []) {
        if (!rng.chance(d.rate)) continue;
        const item = data.get('items', d.itemId);
        const qty = rng.int(d.qty?.[0] ?? 1, d.qty?.[1] ?? 1);
        const quality = item.hasQuality ? rollQuality(data, rng, 0) : 'q1';
        addItem(save, data, d.itemId, qty, quality, e.defId);
        const key = `${d.itemId}/${quality}`;
        const cur = dropMap.get(key) ?? { itemId: d.itemId, quality, qty: 0 };
        cur.qty += qty;
        dropMap.set(key, cur);
      }
    }
    summary.drops = [...dropMap.values()];
    summary.recruits = recruitAfterBattle(save, data, defeated.map((e) => ({ defId: e.defId, level: e.level })), rng);

    // ボス: 固定報酬・撃破フラグ・特殊加入
    const alliesDown = result.allies.filter((a) => !a.alive).length;
    for (const info of result.bosses.filter((x) => x.defeated)) {
      const boss = data.get('bosses', info.bossId);
      for (const it of boss.rewards?.items ?? []) {
        addItem(save, data, it.itemId, it.qty, it.quality ?? 'q1', boss.id);
        summary.drops.push({ itemId: it.itemId, quality: it.quality ?? 'q1', qty: it.qty });
      }
      if (boss.rewards?.gold) {
        addCurrency(save, data, b.goldCurrencyId, boss.rewards.gold);
        summary.gold += boss.rewards.gold;
      }
      if (boss.defeatFlag) save.flags[boss.defeatFlag] = true;
      if (boss.recruit) {
        const ctx = { ...info, timeMs: result.timeMs, alliesDown };
        const met = (boss.recruit.conditions ?? []).every((c) => BOSS_RECRUIT_CONDITIONS[c.type]?.(c, ctx) ?? false);
        const chance = met ? boss.recruit.chance ?? 1 : 0;
        const success = met && rng.next() < chance;
        summary.recruits.push({
          monsterId: boss.monsterId,
          chance,
          success,
          boss: true,
          hint: met ? null : boss.recruit.hint ?? null,
          grant: success ? grantUnit(save, data, boss.monsterId, { level: info.level }) : undefined,
        });
      }
    }
  }

  if (result.outcome === 'lost') {
    returnToTown(save);
    summary.returnedToTown = true;
    if (applyHp) for (const id of partyMembers(save)) setCurrentHp(save, data, id, b.defeat.hpAfterDefeat);
  }
  return summary;
}
