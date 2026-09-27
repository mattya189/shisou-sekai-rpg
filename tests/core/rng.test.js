import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';

test('同じseedなら同じ乱数列になる', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('違うseedなら違う乱数列になる', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('int は範囲内の整数を返す', () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.int(3, 5);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 5);
  }
});

test('状態を保存・復元すると続きが再現できる', () => {
  const r = createRng(9);
  r.next();
  const s = r.getState();
  const x = r.next();
  r.setState(s);
  assert.equal(r.next(), x);
});

test('weighted は重み0の要素を選ばない', () => {
  const r = createRng(3);
  for (let i = 0; i < 200; i++) {
    const e = r.weighted([{ id: 'a', weight: 0 }, { id: 'b', weight: 1 }]);
    assert.equal(e.id, 'b');
  }
});
