/**
 * 特技の発動条件レジストリ。
 *
 * 新しい発動条件を追加するときは、ここに1件追加するだけでよい。
 *   params   : 必須パラメータ名（データ検証で使う）
 *   describe : 画面表示用の説明文
 *   check    : 戦闘中の判定。(params, ctx) => boolean
 *
 * check に渡される ctx:
 *   self        : 行動するユニット
 *   allies      : 生きている味方（自分を含む）
 *   enemies     : 生きている敵
 *   target      : 今回の主な攻撃対象（「敵の〜」条件はこのユニットを見る）
 *   attackCount : 今回の攻撃が何回目か（1から）
 *
 * データ側の書き方: { "type": "attackCountMultiple", "n": 2 }
 * 複合条件:        { "type": "all", "of": [ {...}, {...} ] }
 */
import { hpPct, hasStatus } from './unitState.js';

function markerStacks(unit, markerId) {
  return unit?.markers?.[markerId]?.stacks ?? 0;
}

/**
 * @typedef {{ params: string[], describe: (p: any, data?: any) => string, check: (p: any, ctx: any) => boolean }} ConditionDef
 */

/** @type {Record<string, ConditionDef>} */
export const CONDITIONS = {
  always: {
    params: [],
    describe: () => '毎回',
    check: () => true,
  },
  attackCountMultiple: {
    params: ['n'],
    describe: (p) => `${p.n}の倍数回目の攻撃`,
    check: (p, c) => c.attackCount % p.n === 0,
  },
  attackCountEvery: {
    params: ['n'],
    describe: (p) => `${p.start ?? p.n}回目から${p.n}回ごと`,
    check: (p, c) => {
      const start = p.start ?? p.n;
      return c.attackCount >= start && (c.attackCount - start) % p.n === 0;
    },
  },
  selfHpBelow: {
    params: ['pct'],
    describe: (p) => `自分のHPが${p.pct}%以下`,
    check: (p, c) => hpPct(c.self) <= p.pct,
  },
  allyHpBelow: {
    params: ['pct'],
    describe: (p) => `HPが${p.pct}%以下の味方がいる`,
    check: (p, c) => c.allies.some((a) => hpPct(a) <= p.pct),
  },
  enemyHpBelow: {
    params: ['pct'],
    describe: (p) => `敵のHPが${p.pct}%以下`,
    check: (p, c) => Boolean(c.target) && hpPct(c.target) <= p.pct,
  },
  enemyHasStatus: {
    params: ['statusId'],
    describe: (p, data) => `敵が${nameOf(data, 'statuses', p.statusId)}状態`,
    check: (p, c) => Boolean(c.target) && hasStatus(c.target, p.statusId),
  },
  selfMissingStatus: {
    params: ['statusId'],
    describe: (p, data) => `自分が${nameOf(data, 'statuses', p.statusId)}状態ではない`,
    check: (p, c) => !hasStatus(c.self, p.statusId),
  },
  randomChance: {
    params: ['chance'],
    describe: (p) => `${Math.round(p.chance * 100)}%の確率`,
    check: (p, c) => c.rng.chance(p.chance),
  },
  enemyMarkerAtLeast: {
    params: ['markerId', 'stacks'],
    describe: (p, data) => `敵の${nameOf(data, 'markers', p.markerId)}が${p.stacks}以上`,
    check: (p, c) => c.enemies.some((e) => markerStacks(e, p.markerId) >= p.stacks),
  },
  enemyMarkerTotalAtLeast: {
    params: ['markerId', 'stacks'],
    describe: (p, data) => `敵全体の${nameOf(data, 'markers', p.markerId)}合計が${p.stacks}以上`,
    check: (p, c) => c.enemies.reduce((n, e) => n + markerStacks(e, p.markerId), 0) >= p.stacks,
  },
  enemyBreak: {
    params: [],
    describe: () => '敵がBREAK中',
    // 部位を狙っているときは本体の状態を見る
    check: (p, c) => Boolean((c.target?.partOfUnit ?? c.target)?.broken),
  },
  enemyCharging: {
    params: [],
    describe: () => '敵が大技を準備中',
    check: (p, c) => Boolean((c.target?.partOfUnit ?? c.target)?.charging),
  },
  all: {
    params: ['of'],
    describe: (p, data) => p.of.map((x) => describeCondition(x, data)).join(' かつ '),
    check: (p, c) => p.of.every((x) => checkCondition(x, c)),
  },
  any: {
    params: ['of'],
    describe: (p, data) => p.of.map((x) => describeCondition(x, data)).join(' または '),
    check: (p, c) => p.of.some((x) => checkCondition(x, c)),
  },
};

function nameOf(data, category, id) {
  return data?.find?.(category, id)?.name ?? id;
}

export function describeCondition(condition, data) {
  const def = CONDITIONS[condition?.type];
  if (!def) return `（不明な条件: ${condition?.type}）`;
  return def.describe(condition, data);
}

/** 未登録の条件は満たさない扱い（データ検証で事前に弾く） */
export function checkCondition(condition, ctx) {
  const def = CONDITIONS[condition?.type];
  return def ? def.check(condition, ctx) : false;
}

/**
 * @returns {string[]} エラーメッセージ
 */
export function validateCondition(condition, where = 'trigger') {
  if (!condition || typeof condition !== 'object') return [`${where} がありません`];
  const def = CONDITIONS[condition.type];
  if (!def) return [`${where}.type "${condition.type}" は未登録の発動条件です（src/battle/conditions.js）`];
  const errors = [];
  for (const p of def.params) {
    if (condition[p] === undefined) errors.push(`${where}: 条件 ${condition.type} にはパラメータ ${p} が必要です`);
  }
  if ((condition.type === 'all' || condition.type === 'any') && Array.isArray(condition.of)) {
    condition.of.forEach((c, i) => errors.push(...validateCondition(c, `${where}.of[${i}]`)));
  }
  if (condition.type === 'randomChance' && !(condition.chance >= 0 && condition.chance <= 1)) {
    errors.push(`${where}: chance は0〜1で指定してください`);
  }
  return errors;
}
