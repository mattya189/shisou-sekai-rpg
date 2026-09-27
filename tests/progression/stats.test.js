import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, unitStats } from '../../src/progression/stats.js';
import { grantEquipment, equipToUnit } from '../../src/progression/equipment.js';
import { grantUnit } from '../../src/progression/units.js';
import { createRng } from '../../src/core/rng.js';
import { newGameFixture } from '../helpers.js';

const base = { equipment: [null, null], equippedSkills: [], extraSkills: [] };

test('Lv1・ランク1は基礎値そのまま', async () => {
  const { data } = await newGameFixture();
  const s = computeStats(data, { ...base, defId: 'mon_002', level: 1, rank: 1 });
  assert.deepEqual(s, { hp: 90, mp: 36, atk: 15, def: 8, attackIntervalMs: 1600 });
});

test('レベルで成長値ぶん上がる', async () => {
  const { data } = await newGameFixture();
  const s = computeStats(data, { ...base, defId: 'mon_002', level: 11, rank: 1 });
  assert.equal(s.hp, 90 + 9 * 10);
  assert.equal(s.atk, 15 + 15);
});

test('ランク倍率がかかる', async () => {
  const { data } = await newGameFixture();
  const s = computeStats(data, { ...base, defId: 'mon_002', level: 1, rank: 2 });
  assert.equal(s.hp, Math.floor(90 * 1.08));
});

test('静的パッシブ（防御+10%）が反映される', async () => {
  const { data } = await newGameFixture();
  const s = computeStats(data, { ...base, defId: 'mon_004', level: 1, rank: 1 });
  assert.equal(s.def, Math.floor(16 * 1.1));
});

test('装備の基本能力・強化値・ランダム能力が加算される', async () => {
  const { data } = await newGameFixture();
  const inst = { uid: 'x', defId: 'equip_001', plus: 3, randomStats: [{ stat: 'hp', value: 10 }] };
  const s = computeStats(data, { ...base, defId: 'mon_002', level: 1, rank: 1 }, [inst]);
  assert.equal(s.atk, 15 + 6 + 3);
  assert.equal(s.hp, 90 + 10);
});

test('攻撃間隔短縮の装備が効き、下限を下回らない', async () => {
  const { data } = await newGameFixture();
  const shoes = { uid: 'x', defId: 'equip_004', plus: 10, randomStats: [] };
  const s = computeStats(data, { ...base, defId: 'mon_002', level: 1, rank: 1 }, [shoes]);
  assert.equal(s.attackIntervalMs, Math.round(1600 * (1 - 10 / 100)));
  const many = Array(50).fill(shoes);
  assert.equal(computeStats(data, { ...base, defId: 'mon_002', level: 1, rank: 1 }, many).attackIntervalMs, data.balance.minAttackIntervalMs);
});

test('所持ユニットは装備込みで計算される', async () => {
  const { data, save } = await newGameFixture();
  grantUnit(save, data, 'mon_003');
  const before = unitStats(save, data, 'mon_003');
  const inst = grantEquipment(save, data, 'equip_002', createRng(5));
  equipToUnit(save, data, 'mon_003', 1, inst.uid);
  const after = unitStats(save, data, 'mon_003');
  assert.ok(after.def >= before.def + 4);
});
