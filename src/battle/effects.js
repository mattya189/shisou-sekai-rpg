/**
 * 特技効果レジストリ。data/skills.json の effects[].type と対応する。
 *
 * 新しい効果を追加するときは、ここに1件追加する。
 *   params : 必須パラメータ名（データ検証）
 *   apply(effect, api, act) : 戦闘中の処理
 *     act = { actor, primaryTarget, skill, results }
 *     api = エンジンが渡す操作（dealDamage / heal / applyStatus / targets）
 *
 * データ側の書き方: { "type": "damage", "target": "enemySingle", "power": 1.6 }
 */
import { effectiveStat } from './combatant.js';
import { validateCondition } from './conditions.js';

/**
 * damage の breakPower: ボスのBREAKゲージを1ヒットあたりいくつ削るか（省略時1）
 */

/** 効果の対象 */
export const TARGETS = ['enemySingle', 'enemyAll', 'self', 'allyLowestHp', 'allyAll', 'sourceAttacker'];

export const EFFECTS = {
  consumeMarker: {
    params: ['target', 'markerId', 'maxPerTarget', 'resultKey'],
    apply(e, api, act) {
      let total = 0;
      for (const target of api.targets(e.target, act)) {
        const amount = Math.min(e.maxPerTarget, api.markerStacks(target, e.markerId));
        total -= api.addMarker(target, e.markerId, -amount, act.results);
      }
      act.consumed ??= {};
      act.consumed[e.resultKey] = total;
      // Notify only the owner of this skill, once with the total (round after summing).
      api.markerConsumed(act.actor, e.markerId, total, act);
    },
  },
  resourceScaledDamage: {
    params: ['target', 'basePower', 'powerPerStack'],
    apply(e, api, act) {
      const stacks = e.selfMarkerId ? api.markerStacks(act.actor, e.selfMarkerId) : act.consumed?.[e.resultKey] ?? 0;
      for (const target of api.targets(e.target, act)) {
        api.dealDamage(act.actor, target, e.basePower + stacks * e.powerPerStack, act.skill?.element ?? null, act.results, 1, e.damageType ?? 'magic');
      }
    },
  },
  healFromDamage: {
    params: ['target', 'ratio'],
    apply(e, api, act) {
      const amount = act.results.slice(act.damageStart ?? 0).filter((r) => r.kind === 'damage').reduce((n, r) => n + r.amount, 0);
      for (const target of api.targets(e.target, act)) api.heal(target, Math.floor(amount * e.ratio), 'skill', act.results);
    },
  },
  damage: {
    params: ['target', 'power'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const hits = e.hits ?? 1;
        for (let i = 0; i < hits && t.alive; i++) {
          api.dealDamage(act.actor, t, e.power, e.element ?? act.skill?.element ?? null, act.results, e.breakPower ?? 1, e.damageType ?? 'physical', e.scalingStat);
        }
      }
    },
  },
  heal: {
    params: ['target', 'power'],
    apply(e, api, act) {
      const amount = Math.max(1, Math.floor(effectiveStat(act.actor, 'atk') * e.power));
      for (const t of api.targets(e.target, act)) api.heal(t, amount, 'skill', act.results);
    },
  },
  healPctMax: {
    params: ['target', 'pct'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) api.heal(t, Math.max(1, Math.floor(t.maxHp * e.pct / 100)), 'skill', act.results);
    },
  },
  applyStatus: {
    params: ['target', 'statusId'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) api.applyStatus(t, e.statusId, e.chance ?? 1, act.results, act);
    },
  },
  markerScaledDamage: {
    params: ['target', 'basePower', 'markerId', 'powerPerStack'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const power = e.basePower + api.markerStacks(t, e.markerId) * e.powerPerStack;
        api.dealDamage(act.actor, t, power, act.skill?.element ?? null, act.results, e.breakPower ?? 1, e.damageType ?? 'physical');
      }
    },
  },
  markerThresholdDamage: {
    params: ['target', 'markerId', 'threshold', 'basePower', 'boostedPower'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const power = api.markerStacks(t, e.markerId) >= e.threshold ? e.boostedPower : e.basePower;
        api.dealDamage(act.actor, t, power, e.element ?? act.skill?.element ?? null, act.results, e.breakPower ?? 1, e.damageType ?? 'physical');
      }
    },
  },
  addMarker: {
    params: ['target', 'markerId'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const amount = e.amount ?? api.randomInt(e.min, e.max);
        api.addMarker(t, e.markerId, amount, act.results);
      }
    },
  },
  addRandomResource: {
    params: ['target', 'resourceId', 'items', 'count', 'max'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) api.addRandomResourceItems(t, e.resourceId, e.items, e.count, e.max, act.results);
    },
  },
  addResourceItems: {
    params: ['target', 'resourceId', 'items', 'max'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) api.addResourceItems(t, e.resourceId, e.items, e.max, act.results);
    },
  },
  consumeResource: {
    params: ['target', 'resourceId', 'items'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) api.consumeResourceItems(t, e.resourceId, e.items, act.results);
    },
  },
  armDoubleNextResource: {
    params: ['target', 'resourceId'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) api.armDoubleNextResource(t, e.resourceId, act.results);
    },
  },
  absorbMarkerToRandomResource: {
    params: ['markerId', 'maxPerTarget', 'per', 'resourceId', 'items', 'max'],
    apply(e, api, act) {
      let total = 0;
      for (const target of api.targets('enemyAll', act)) {
        const amount = Math.min(e.maxPerTarget, api.markerStacks(target, e.markerId));
        if (amount > 0) total += -api.addMarker(target, e.markerId, -amount, act.results);
      }
      const count = Math.floor(total / e.per);
      if (count > 0) api.addRandomResourceItems(act.actor, e.resourceId, e.items, count, e.max, act.results);
      act.results.push({ kind: 'markerAbsorbed', targetId: act.actor.id, markerId: e.markerId, amount: total, remainder: total % e.per });
    },
  },
  markerBandStatus: {
    params: ['target', 'markerId', 'bands'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const stacks = api.markerStacks(t, e.markerId);
        const band = [...e.bands].sort((a, b) => b.min - a.min).find((b) => stacks >= b.min);
        if (band) api.applyStatus(t, band.statusId, 1, act.results, act);
      }
    },
  },
  removeOneDebuff: {
    params: ['target'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const removed = t.statuses.find((s) => ['statModifier', 'intervalPctModifier', 'attackDelay', 'skipAction', 'damageOverTime'].includes(s.kind));
        if (removed) {
          t.statuses = t.statuses.filter((s) => s !== removed);
          act.results.push({ kind: 'statusRemoved', targetId: t.id, statusId: removed.statusId });
        }
      }
    },
  },
  multiElementDamage: {
    params: ['target', 'power', 'elements'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        for (const element of e.elements) if (t.alive) api.dealDamage(act.actor, t, e.power, element, act.results, e.breakPower ?? 1, e.damageType ?? 'magic');
      }
    },
  },
  resourceMix: {
    params: ['target', 'resourceId', 'pairs'],
    apply(e, api, act) {
      const held = api.resourceItems(act.actor, e.resourceId);
      const pair = e.pairs.find((p) => p.items.every((item) => held.includes(item)))
        ?? { items: [...new Set(held)].slice(0, 2), effects: e.fallbackEffects ?? [] };
      if (pair.items.length < 2 || !api.consumeResourceItems(act.actor, e.resourceId, pair.items, act.results)) return;
      for (const nested of pair.effects) EFFECTS[nested.type]?.apply(nested, api, act);
    },
  },
  collectMarker: {
    params: ['markerId'],
    apply(e, api, act) {
      api.collectMarker(api.targets('enemyAll', act), e.markerId, act.results);
    },
  },
  scheduleEffects: {
    params: ['afterTurns', 'effects'],
    apply(e, api, act) {
      api.scheduleEffects(act.actor, e.afterTurns, e.effects, act.skill, act.results);
    },
  },
  conditionalEffects: {
    params: ['condition', 'effects'],
    apply(e, api, act) {
      if (!api.checkCondition(e.condition, act)) return;
      for (const nested of e.effects) EFFECTS[nested.type]?.apply(nested, api, act);
    },
  },
  randomElementDamage: {
    params: ['target', 'power'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const element = api.randomAttackElement();
        api.dealDamage(act.actor, t, e.power, element, act.results, e.breakPower ?? 1, e.damageType ?? 'physical', e.scalingStat);
      }
    },
  },
  allElementDamage: {
    params: ['target', 'power'],
    apply(e, api, act) {
      // 全属性は対象ごとの最有効属性を使う1回攻撃。属性数ぶんの多段にはしない。
      for (const t of api.targets(e.target, act)) {
        api.dealDamage(act.actor, t, e.power, api.bestAttackElement(t), act.results, e.breakPower ?? 1, e.damageType ?? 'physical', e.scalingStat);
      }
    },
  },
  randomPowerDamage: {
    params: ['target', 'minPower', 'maxPower'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const power = api.randomInt(e.minPower, e.maxPower) / 100;
        api.dealDamage(act.actor, t, power, act.skill?.element ?? null, act.results, e.breakPower ?? 1, e.damageType ?? 'physical', e.scalingStat, e.triggerHitPassives !== false);
      }
    },
  },
  applyStatusBySpecies: {
    params: ['speciesId', 'statusId', 'scope'],
    apply(e, api, act) {
      for (const t of api.unitsBySpecies(e.speciesId, e.scope, act.actor)) api.applyStatus(t, e.statusId, e.chance ?? 1, act.results, act);
    },
  },
  speciesScaledDamage: {
    params: ['target', 'speciesId', 'basePower', 'powerPerOtherAlly'],
    apply(e, api, act) {
      const others = api.unitsBySpecies(e.speciesId, 'alliesExceptSelf', act.actor).length;
      const power = e.basePower + others * e.powerPerOtherAlly;
      for (const t of api.targets(e.target, act)) {
        api.dealDamage(act.actor, t, power, act.skill?.element ?? null, act.results, e.breakPower ?? 1, e.damageType ?? 'physical', e.scalingStat);
      }
    },
  },
  advanceAttackCountBySpecies: {
    params: ['speciesId'],
    apply(e, api, act) {
      const others = api.unitsBySpecies(e.speciesId, 'alliesExceptSelf', act.actor);
      api.addAttackCount(act.actor, others.length, act.results);
      for (const unit of others) api.addAttackCount(unit, 1, act.results);
    },
  },
  queueComboOnNextAttack: {
    params: [],
    apply(e, api, act) {
      api.queueAttackCombo(act.actor, act.skill, act.results);
    },
  },
};

export function validateEffect(effect, where) {
  if (!effect || typeof effect !== 'object') return [`${where} が不正です`];
  const def = EFFECTS[effect.type];
  if (!def) return [`${where}.type "${effect.type}" は未登録の効果です（src/battle/effects.js）`];
  const errors = [];
  for (const p of def.params) {
    if (effect[p] === undefined) errors.push(`${where}: 効果 ${effect.type} にはパラメータ ${p} が必要です`);
  }
  if (effect.target !== undefined && !TARGETS.includes(effect.target)) {
    errors.push(`${where}: target "${effect.target}" は未登録です（${TARGETS.join(', ')}）`);
  }
  if ((effect.type === 'scheduleEffects' || effect.type === 'conditionalEffects') && Array.isArray(effect.effects)) {
    effect.effects.forEach((e, i) => errors.push(...validateEffect(e, `${where}.effects[${i}]`)));
  }
  if (effect.type === 'resourceMix') {
    for (const [i, pair] of (effect.pairs ?? []).entries()) {
      if (!Array.isArray(pair.items) || pair.items.length !== 2 || pair.items[0] === pair.items[1]) errors.push(`${where}.pairs[${i}].items は異なる2種類にしてください`);
      (pair.effects ?? []).forEach((e, j) => errors.push(...validateEffect(e, `${where}.pairs[${i}].effects[${j}]`)));
    }
    (effect.fallbackEffects ?? []).forEach((e, i) => errors.push(...validateEffect(e, `${where}.fallbackEffects[${i}]`)));
  }
  if (effect.type === 'conditionalEffects') errors.push(...validateCondition(effect.condition, `${where}.condition`));
  if (effect.type === 'randomPowerDamage' && !(effect.minPower <= effect.maxPower)) errors.push(`${where}: minPower は maxPower 以下にしてください`);
  if (effect.type === 'consumeMarker' && !(Number.isInteger(effect.maxPerTarget) && effect.maxPerTarget >= 0)) errors.push(`${where}: maxPerTarget は非負整数にしてください`);
  if (effect.type === 'resourceScaledDamage' && !effect.selfMarkerId && !effect.resultKey) errors.push(`${where}: selfMarkerId または resultKey が必要です`);
  if (effect.type === 'healFromDamage' && !(effect.ratio >= 0 && effect.ratio <= 1)) errors.push(`${where}: ratio は0〜1で指定してください`);
  if (effect.type === 'addMarker' && effect.amount == null && !(Number.isInteger(effect.min) && Number.isInteger(effect.max) && effect.min <= effect.max)) {
    errors.push(`${where}: addMarker は amount または整数の min / max が必要です`);
  }
  return errors;
}
