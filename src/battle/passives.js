/**
 * 固有パッシブ効果レジストリ。data/passives.json の effects[].type と対応する。
 *
 * 新しい効果を追加するときは、ここに1件追加する。使えるフック（すべて任意）:
 *   params                      : 必須パラメータ名
 *   static                      : true なら戦闘外の能力値計算にも反映（src/progression/stats.js）
 *   onAttackStart(e, unit, key) : 攻撃回数が増えた直後（非攻撃行動では呼ばれない）
 *   statPct(e, unit, key, stat) : 戦闘中の能力値の増減（%）
 *   damagePct(e, attacker, target) : 与えるダメージの増減（%）
 *   normalAttackMpPct(e)        : 通常攻撃で回復するMPの追加（最大MPの%）
 *   afterAttackHit(e, unit, target, api, ctx) : 通常/特技を問わず、攻撃が命中した直後
 *   afterAction(e, unit, key, api, ctx) : 行動の後。ctx.attacked で攻撃成立を判定できる
 *
 * key はパッシブ効果ごとの識別子。unit.passiveState[key] に累積値などを保存できる。
 */
import { hasStatus } from './unitState.js';

export const PASSIVE_EFFECTS = {
  consumedMarkerGainSelfMarker: {
    params: ['markerId', 'selfMarkerId', 'ratio'],
    onMarkerConsumed(e, unit, api, ctx) {
      if (ctx.actor !== unit || !ctx.skill || ctx.markerId !== e.markerId) return;
      api.addMarker(unit, e.selfMarkerId, Math.floor(ctx.amount * e.ratio), ctx.results);
    },
  },
  statPerAttackCount: {
    params: ['stat', 'pctPerStack', 'maxStacks'],
    onAttackStart(e, unit, key) {
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
    afterAction(e, unit, key, api, ctx) {
      if (ctx.attacked && unit.attackCount % e.n === 0) {
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
  normalAttackMarker: {
    params: ['markerId', 'amount'],
    afterNormalAttackHit(e, unit, target, api) {
      api.addMarker(target, e.markerId, e.amount);
    },
  },
  /** 対象のマーカーを一定量消費し、自身の別マーカーへ変換する。 */
  consumeTargetMarkerOnHitGainSelfMarker: {
    params: ['targetMarkerId', 'required', 'consume', 'selfMarkerId', 'gain'],
    afterAttackHit(e, unit, target, api) {
      if (api.markerStacks(target, e.targetMarkerId) < e.required) return;
      api.addMarker(target, e.targetMarkerId, -e.consume);
      api.addMarker(unit, e.selfMarkerId, e.gain);
    },
  },
  /** 物理攻撃の命中時、seed固定可能な確率で自身へマーカーを付与する。 */
  chanceSelfMarkerOnPhysicalHit: {
    params: ['markerId', 'amount', 'chance'],
    afterAttackHit(e, unit, target, api, ctx) {
      if (ctx.damageType !== 'physical' || !api.chance(e.chance)) return;
      api.addMarker(unit, e.markerId, e.amount);
    },
  },
  markerGainToRandomResource: {
    params: ['markerId', 'per', 'resourceId', 'items', 'max'],
    onMarkerIncreased(e, unit, key, api, ctx) {
      if (ctx.markerId !== e.markerId || ctx.amount <= 0) return;
      const state = unit.passiveState[key] ?? { progress: 0, doubleNext: false };
      state.progress += ctx.amount;
      while (state.progress >= e.per) {
        state.progress -= e.per;
        const count = state.doubleNext ? 2 : 1;
        state.doubleNext = false;
        api.addRandomResourceItems(unit, e.resourceId, e.items, count, e.max);
      }
      unit.passiveState[key] = state;
    },
  },
};

export function validatePassiveEffect(effect, where) {
  const def = PASSIVE_EFFECTS[effect?.type];
  if (!def) return [`${where}.type "${effect?.type}" は未登録のパッシブ効果です（src/battle/passives.js）`];
  return def.params
    .filter((p) => effect[p] === undefined)
    .map((p) => `${where}: パッシブ効果 ${effect.type} にはパラメータ ${p} が必要です`);
}
