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
  damage: {
    params: ['target', 'power'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const hits = e.hits ?? 1;
        for (let i = 0; i < hits && t.alive; i++) {
          api.dealDamage(act.actor, t, e.power, act.skill?.element ?? null, act.results, e.breakPower ?? 1, e.damageType ?? 'physical', e.scalingStat);
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
  applyStatus: {
    params: ['target', 'statusId'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) api.applyStatus(t, e.statusId, e.chance ?? 1, act.results);
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
  addMarker: {
    params: ['target', 'markerId'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const amount = e.amount ?? api.randomInt(e.min, e.max);
        api.addMarker(t, e.markerId, amount, act.results);
      }
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
      for (const t of api.unitsBySpecies(e.speciesId, e.scope, act.actor)) api.applyStatus(t, e.statusId, e.chance ?? 1, act.results);
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
  if (effect.type === 'conditionalEffects') errors.push(...validateCondition(effect.condition, `${where}.condition`));
  if (effect.type === 'randomPowerDamage' && !(effect.minPower <= effect.maxPower)) errors.push(`${where}: minPower は maxPower 以下にしてください`);
  if (effect.type === 'addMarker' && effect.amount == null && !(Number.isInteger(effect.min) && Number.isInteger(effect.max) && effect.min <= effect.max)) {
    errors.push(`${where}: addMarker は amount または整数の min / max が必要です`);
  }
  return errors;
}
