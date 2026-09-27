/**
 * 固有パッシブ効果レジストリ。data/passives.json の effects[].type と対応する。
 *
 * 新しい効果を追加するときは、ここに1件追加する。使えるフック（すべて任意）:
 *   params                      : 必須パラメータ名
 *   static                      : true なら戦闘外の能力値計算にも反映（src/progression/stats.js）
 *   onActionStart(e, unit, key) : 攻撃回数が増えた直後
 *   statPct(e, unit, key, stat) : 戦闘中の能力値の増減（%）
 *   damagePct(e, attacker, target) : 与えるダメージの増減（%）
 *   normalAttackMpPct(e)        : 通常攻撃で回復するMPの追加（最大MPの%）
 *   afterAction(e, unit, key, api) : 行動の後
 *
 * key はパッシブ効果ごとの識別子。unit.passiveState[key] に累積値などを保存できる。
 */
import { hasStatus } from './unitState.js';

export const PASSIVE_EFFECTS = {
  statPerAttackCount: {
    params: ['stat', 'pctPerStack', 'maxStacks'],
    onActionStart(e, unit, key) {
      unit.passiveState[key] = Math.min(e.maxStacks, (unit.passiveState[key] ?? 0) + 1);
    },
    statPct(e, unit, key, stat) {
      return e.stat === stat ? (unit.passiveState[key] ?? 0) * e.pctPerStack : 0;
    },
  },
  normalAttackMpBonus: {
    params: ['pctOfMaxMp'],
    normalAttackMpPct(e) {
      return e.pctOfMaxMp;
    },
  },
  healEveryNAttacks: {
    params: ['n', 'pctOfMaxHp'],
    afterAction(e, unit, key, api) {
      if (unit.attackCount % e.n === 0) {
        api.heal(unit, Math.max(1, Math.floor((unit.maxHp * e.pctOfMaxHp) / 100)), 'passive');
      }
    },
  },
  damageVsStatus: {
    params: ['pct'],
    damagePct(e, attacker, target) {
      return hasStatus(target, e.statusId) ? e.pct : 0;
    },
  },
  flatStatPct: {
    params: ['stat', 'pct'],
    static: true,
  },
};

export function validatePassiveEffect(effect, where) {
  const def = PASSIVE_EFFECTS[effect?.type];
  if (!def) return [`${where}.type "${effect?.type}" は未登録のパッシブ効果です（src/battle/passives.js）`];
  return def.params
    .filter((p) => effect[p] === undefined)
    .map((p) => `${where}: パッシブ効果 ${effect.type} にはパラメータ ${p} が必要です`);
}
