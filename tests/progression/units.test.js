import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantUnit, listOwnedUnits } from '../../src/progression/units.js';
import { countItem } from '../../src/progression/inventory.js';
import { newGameFixture } from '../helpers.js';

test('新しいモンスターを入手できる', async () => {
  const { data, save } = await newGameFixture();
  const r = grantUnit(save, data, 'mon_002');
  assert.equal(r.status, 'added');
  assert.equal(save.units.mon_002.kind, 'monster');
  assert.equal(save.codex.monsters.mon_002.flags.recruited, true);
});

test('同じ種類は1体だけ。再入手は素材に変換される', async () => {
  const { data, save } = await newGameFixture();
  const before = countItem(save, 'item_009');
  const r = grantUnit(save, data, 'mon_001');
  assert.equal(r.status, 'duplicate');
  assert.equal(countItem(save, 'item_009') - before, 3);
  assert.equal(listOwnedUnits(save, data, 'monster').filter((u) => u.unitId === 'mon_001').length, 1);
});

test('変異種は別IDなので別に所有できる', async () => {
  const { data, save } = await newGameFixture();
  assert.equal(grantUnit(save, data, 'mon_005').status, 'added');
  assert.ok(save.units.mon_001 && save.units.mon_005);
});

test('入手時に習得済み特技が自動でセットされる', async () => {
  const { data, save } = await newGameFixture();
  grantUnit(save, data, 'mon_005', { level: 1 });
  assert.deepEqual(save.units.mon_005.equippedSkills, ['skill_005', 'skill_004']);
});

test('データから消えたユニットは一覧に出ない（セーブは壊さない）', async () => {
  const { data, save } = await newGameFixture();
  save.units.mon_404 = { defId: 'mon_404', level: 1 };
  const ids = listOwnedUnits(save, data).map((u) => u.unitId);
  assert.ok(!ids.includes('mon_404'));
  assert.ok(save.units.mon_404);
});

test('存在しないユニットは入手できない', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => grantUnit(save, data, 'mon_999'));
});
