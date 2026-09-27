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

/**
 * damage の breakPower: ボスのBREAKゲージを1ヒットあたりいくつ削るか（省略時1）
 */

/** 効果の対象 */
export const TARGETS = ['enemySingle', 'enemyAll', 'self', 'allyLowestHp', 'allyAll'];

export const EFFECTS = {
  damage: {
    params: ['target', 'power'],
    apply(e, api, act) {
      for (const t of api.targets(e.target, act)) {
        const hits = e.hits ?? 1;
        for (let i = 0; i < hits && t.alive; i++) {
          api.dealDamage(act.actor, t, e.power, act.skill?.element ?? null, act.results, e.breakPower ?? 1);
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
  return errors;
}
