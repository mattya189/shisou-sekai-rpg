import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addExp, expToNext, setLevel, setRank } from '../../src/progression/leveling.js';
import { newGameFixture } from '../helpers.js';

test('経験値でレベルが上がり、余りは持ち越す', async () => {
  const { data, save } = await newGameFixture();
  save.units.mon_001.level = 1;
  save.units.mon_001.exp = 0;
  const need = expToNext(1, data.balance);
  const r = addExp(save, data, 'mon_001', need + 1);
  assert.equal(r.levelsGained, 1);
  assert.equal(save.units.mon_001.level, 2);
  assert.equal(save.units.mon_001.exp, 1);
});

test('レベル上限は100', async () => {
  const { data, save } = await newGameFixture();
  addExp(save, data, 'mon_001', 1e12);
  assert.equal(save.units.mon_001.level, 100);
  assert.equal(save.units.mon_001.exp, 0);
  assert.equal(addExp(save, data, 'mon_001', 100).levelsGained, 0);
});

test('レベルアップで覚えた特技を返し、空き枠に自動セットする', async () => {
  const { data, save } = await newGameFixture();
  setLevel(save, data, 'mon_001', 5);
  assert.deepEqual(save.units.mon_001.equippedSkills, ['skill_001']);
  const r = addExp(save, data, 'mon_001', expToNext(5, data.balance));
  assert.deepEqual(r.learned, ['skill_004']);
  assert.deepEqual(save.units.mon_001.equippedSkills, ['skill_001', 'skill_004']);
});

test('レベルを下げると未習得になった特技はセットから外れる', async () => {
  const { data, save } = await newGameFixture();
  setLevel(save, data, 'chr_001', 20);
  assert.ok(save.units.chr_001.equippedSkills.includes('skill_011'));
  setLevel(save, data, 'chr_001', 1);
  assert.deepEqual(save.units.chr_001.equippedSkills, ['skill_001', 'skill_002']);
});

test('ランクは定義された範囲だけ設定できる', async () => {
  const { data, save } = await newGameFixture();
  setRank(save, data, 'chr_001', 3);
  assert.equal(save.units.chr_001.rank, 3);
  assert.throws(() => setRank(save, data, 'chr_001', 99), /存在しません/);
});

test('低ランクほど必要素材が少ない', async () => {
  const { data } = await newGameFixture();
  const costs = data.balance.ranks.slice(1).map((r) => r.cost.gold);
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
});
