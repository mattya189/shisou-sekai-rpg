import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, removeItem, countItem, summarizeItem, listOwnedItems, addCurrency, spendCurrency, getCurrency } from '../../src/progression/inventory.js';
import { newGameFixture } from '../helpers.js';

test('品質別に数量を管理し、まとめて表示できる', async () => {
  const { data, save } = await newGameFixture();
  addItem(save, data, 'item_001', 29, 'q1');
  addItem(save, data, 'item_001', 17, 'q2');
  addItem(save, data, 'item_001', 10, 'q3');
  addItem(save, data, 'item_001', 6, 'q4');
  addItem(save, data, 'item_001', 2, 'q5');
  const s = summarizeItem(save, data, 'item_001');
  assert.equal(s.total, 68);
  assert.deepEqual(s.byQuality.map((q) => [q.name, q.count]), [
    ['普通', 32], ['良質', 18], ['上質', 10], ['極上', 6], ['最高品質', 2],
  ]);
});

test('品質のないアイテムは q1 にまとまる', async () => {
  const { data, save } = await newGameFixture();
  addItem(save, data, 'item_007', 2, 'q5');
  assert.equal(countItem(save, 'item_007', 'q1'), 2);
  assert.equal(countItem(save, 'item_007', 'q5'), 0);
});

test('所持上限はない', async () => {
  const { data, save } = await newGameFixture();
  addItem(save, data, 'item_003', 1_000_000);
  assert.equal(countItem(save, 'item_003'), 1_000_000);
});

test('足りない数は使えない', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => removeItem(save, data, 'item_001', 99, 'q1'), /足りません/);
  removeItem(save, data, 'item_001', 3, 'q1');
  assert.equal(countItem(save, 'item_001', 'q1'), 0);
});

test('入手した品質は図鑑に記録される', async () => {
  const { data, save } = await newGameFixture();
  addItem(save, data, 'item_004', 1, 'q4');
  assert.deepEqual(save.codex.items.item_004.qualities, { q4: true });
});

test('通貨はアイテムと別に管理する', async () => {
  const { data, save } = await newGameFixture();
  addCurrency(save, data, 'cur_002', 3);
  assert.equal(getCurrency(save, 'cur_002'), 3);
  assert.equal(countItem(save, 'cur_002'), 0);
  spendCurrency(save, data, 'cur_001', 100);
  assert.equal(getCurrency(save, 'cur_001'), 400);
  assert.throws(() => spendCurrency(save, data, 'cur_001', 10_000), /足りません/);
});

test('カテゴリで絞り込める', async () => {
  const { data, save } = await newGameFixture();
  const materials = listOwnedItems(save, data, 'material').map((s) => s.item.id);
  assert.deepEqual(materials, ['item_001']);
});
