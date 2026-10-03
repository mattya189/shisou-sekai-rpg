import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listAdventureDestinations, listWorldZones, selectZone, selectedZoneId } from '../../src/exploration/map.js';
import { loadRealData, newGameFixture } from '../helpers.js';

test('染まり野原は正しい順序の5地帯を持つ', async () => {
  const data = await loadRealData();
  const world = data.get('worlds', 'world_001');
  assert.equal(world.name, '染まり野原');
  assert.deepEqual(world.zoneIds, ['zone_001', 'zone_002', 'zone_003', 'zone_004', 'zone_005']);
  assert.deepEqual(world.zoneIds.map((id) => data.get('zones', id).name), ['通常地帯', '警戒地帯', '危険地帯', '破滅地帯', '神域']);
});

test('通常地帯は解放済みで上位地帯は未解放として扱える', async () => {
  const { data, save } = await newGameFixture();
  const zones = listWorldZones(save, data, 'world_001');
  assert.deepEqual(zones.map((entry) => entry.locked), [false, true, true, true, true]);
  assert.throws(() => selectZone(save, data, 'world_001', 'zone_002'), /未解放/);
  selectZone(save, data, 'world_001', 'zone_001');
  assert.equal(save.exploration.zoneId, 'zone_001');
});

test('地帯ごとに敵表とドロップ・装備報酬を個別設定できる', async () => {
  const data = await loadRealData();
  const normal = data.get('zones', 'zone_001');
  const alert = data.get('zones', 'zone_002');
  assert.notStrictEqual(normal.encounterTableIds, alert.encounterTableIds);
  assert.ok(normal.encounterTableIds.includes('enc_001'));
  assert.ok(normal.rewards.dropItemIds.includes('item_001'));
  assert.ok(normal.rewards.equipmentIds.includes('equip_001'));
  assert.equal(alert.rewards.qualityBonus, 1);
});

test('旧セーブは冒険先から地帯を補完し、冒険先を維持できる', async () => {
  const { data, save } = await newGameFixture();
  save.exploration.zoneId = null;
  save.exploration.adventureId = 'loc_002';
  assert.equal(selectedZoneId(save, data), 'zone_001');
  assert.ok(listAdventureDestinations(save, data).some((entry) => entry.id === 'loc_002'));
});

test('世界規模分類のフィールドはデータに存在しない', async () => {
  const data = await loadRealData();
  for (const world of data.list('worlds')) {
    assert.equal(world.scale, undefined);
    assert.equal(world.sizeCategory, undefined);
  }
});
