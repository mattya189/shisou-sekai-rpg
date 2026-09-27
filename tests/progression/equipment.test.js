import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantEquipment, equipToUnit, findEquipmentOwner } from '../../src/progression/equipment.js';
import { createRng } from '../../src/core/rng.js';
import { newGameFixture } from '../helpers.js';

test('装備個体はランダム能力を持ち、seedが同じなら同じ結果', async () => {
  const a = await newGameFixture();
  const b = await newGameFixture();
  const ia = grantEquipment(a.save, a.data, 'equip_003', createRng(11));
  const ib = grantEquipment(b.save, b.data, 'equip_003', createRng(11));
  assert.equal(ia.randomStats.length, 2);
  assert.deepEqual(ia.randomStats, ib.randomStats);
  const def = a.data.get('equipment', 'equip_003');
  for (const r of ia.randomStats) {
    const p = def.randomStats.pool.find((x) => x.stat === r.stat);
    assert.ok(r.value >= p.min && r.value <= p.max);
  }
});

test('ほかのユニットが装備中なら付け替えになる', async () => {
  const { data, save } = await newGameFixture();
  const uid = save.units.chr_001.equipment[0];
  equipToUnit(save, data, 'chr_002', 1, uid);
  assert.equal(save.units.chr_001.equipment[0], null);
  assert.equal(findEquipmentOwner(save, uid), 'chr_002');
});

test('装備枠は2つ', async () => {
  const { data, save } = await newGameFixture();
  const inst = grantEquipment(save, data, 'equip_001', createRng(1));
  assert.throws(() => equipToUnit(save, data, 'chr_001', 2, inst.uid), /装備枠/);
});
