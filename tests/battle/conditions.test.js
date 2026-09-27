import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONS, checkCondition } from '../../src/battle/conditions.js';

const unit = (hp, maxHp = 100, statuses = []) => ({ hp, maxHp, statuses });
const ctx = (over = {}) => {
  const self = unit(100);
  return { self, allies: [self], enemies: [], target: unit(100), attackCount: 1, ...over };
};

test('すべての発動条件に判定処理がある', () => {
  for (const [type, def] of Object.entries(CONDITIONS)) {
    assert.equal(typeof def.check, 'function', `${type} に check がない`);
  }
});

test('○の倍数', () => {
  const c = { type: 'attackCountMultiple', n: 3 };
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => checkCondition(c, ctx({ attackCount: n }))), [false, false, true, false, false, true]);
});

test('○回ごと（開始回を指定できる）', () => {
  const c = { type: 'attackCountEvery', n: 4, start: 2 };
  const hits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => checkCondition(c, ctx({ attackCount: n })));
  assert.deepEqual(hits, [2, 6, 10]);
});

test('自分・味方・敵のHP%以下', () => {
  assert.equal(checkCondition({ type: 'selfHpBelow', pct: 30 }, ctx({ self: unit(30) })), true);
  assert.equal(checkCondition({ type: 'selfHpBelow', pct: 30 }, ctx({ self: unit(31) })), false);
  assert.equal(checkCondition({ type: 'allyHpBelow', pct: 50 }, ctx({ allies: [unit(90), unit(40)] })), true);
  assert.equal(checkCondition({ type: 'allyHpBelow', pct: 50 }, ctx({ allies: [unit(90), unit(60)] })), false);
  assert.equal(checkCondition({ type: 'enemyHpBelow', pct: 25 }, ctx({ target: unit(20) })), true);
  assert.equal(checkCondition({ type: 'enemyHpBelow', pct: 25 }, ctx({ target: undefined })), false);
});

test('敵の状態異常・BREAK・大技準備中', () => {
  const poisoned = unit(100, 100, [{ statusId: 'status_001' }]);
  assert.equal(checkCondition({ type: 'enemyHasStatus', statusId: 'status_001' }, ctx({ target: poisoned })), true);
  assert.equal(checkCondition({ type: 'enemyHasStatus', statusId: 'status_002' }, ctx({ target: poisoned })), false);
  assert.equal(checkCondition({ type: 'enemyBreak' }, ctx({ target: { ...unit(100), broken: true } })), true);
  assert.equal(checkCondition({ type: 'enemyCharging' }, ctx({ target: { ...unit(100), charging: false } })), false);
});

test('複合条件（かつ・または）', () => {
  const both = { type: 'all', of: [{ type: 'attackCountMultiple', n: 2 }, { type: 'enemyHpBelow', pct: 50 }] };
  assert.equal(checkCondition(both, ctx({ attackCount: 2, target: unit(40) })), true);
  assert.equal(checkCondition(both, ctx({ attackCount: 2, target: unit(60) })), false);
  const either = { type: 'any', of: [{ type: 'attackCountMultiple', n: 2 }, { type: 'enemyHpBelow', pct: 50 }] };
  assert.equal(checkCondition(either, ctx({ attackCount: 3, target: unit(40) })), true);
  assert.equal(checkCondition(either, ctx({ attackCount: 3, target: unit(60) })), false);
});

test('未登録の条件は満たさない', () => {
  assert.equal(checkCondition({ type: 'nope' }, ctx()), false);
});
