import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveRepository, SaveLoadError } from '../../src/save/saveRepository.js';
import { createMemoryStorage } from '../../src/save/storageAdapters.js';
import { migrateSave } from '../../src/save/migrations.js';
import { normalizeSave, CURRENT_SAVE_VERSION } from '../../src/save/saveSchema.js';
import { newGameFixture } from '../helpers.js';

test('新規ゲームは balance.newGame どおりに始まる', async () => {
  const { data, save } = await newGameFixture();
  const ng = data.balance.newGame;
  assert.equal(save.saveVersion, CURRENT_SAVE_VERSION);
  assert.deepEqual(save.party, ng.party);
  assert.equal(save.exploration.townId, ng.townId);
  assert.equal(save.exploration.actionPoints, data.balance.actionPoints.initial);
  for (const u of ng.units) assert.ok(save.units[u.defId]);
  assert.equal(save.inventory.currencies.cur_001, 500);
  assert.equal(save.inventory.items.item_001.q1, 3);
  assert.equal(save.inventory.items.item_001.q2, 1);
  assert.ok(save.units.chr_001.equipment[0]);
});

test('保存して読み込むと同じ内容に戻る', async () => {
  const { save } = await newGameFixture();
  const repo = new SaveRepository(createMemoryStorage(), { now: () => '2026-01-01T00:00:00.000Z' });
  assert.equal(repo.hasSave(), false);
  repo.save(save);
  assert.equal(repo.hasSave(), true);
  const loaded = repo.load();
  assert.deepEqual(loaded, save);
});

test('セーブが無ければ null', () => {
  const repo = new SaveRepository(createMemoryStorage());
  assert.equal(repo.load(), null);
});

test('壊れたセーブは SaveLoadError になり、退避できる', () => {
  const storage = createMemoryStorage({ 'shisou-sekai-rpg/save': '{broken' });
  const repo = new SaveRepository(storage);
  assert.throws(() => repo.load(), SaveLoadError);
  repo.backupAndClear();
  assert.equal(repo.hasSave(), false);
  assert.equal(storage.getItem('shisou-sekai-rpg/save/broken-backup'), '{broken');
});

test('欠けている項目は初期値で補完され、未知の項目は残る', () => {
  const partial = { saveVersion: 1, units: { mon_001: { defId: 'mon_001', level: 5 } }, futureField: { x: 1 } };
  const s = normalizeSave(partial);
  assert.deepEqual(s.inventory.items, {});
  assert.equal(s.exploration.actionPoints, 6);
  assert.equal(s.units.mon_001.level, 5);
  assert.equal(s.units.mon_001.rank, 1);
  assert.deepEqual(s.units.mon_001.equippedSkills, []);
  assert.equal(s.settings.battleSoundEnabled, true);
  assert.equal(s.settings.battleSoundVolume, 0.45);
  assert.deepEqual(s.futureField, { x: 1 });
});

test('JSONとして読めても型が壊れたセーブは安全な既定値へ修復する', () => {
  const broken = {
    saveVersion: 1,
    units: { mon_001: 'broken' },
    party: 'broken',
    inventory: { items: [], equipment: null, currencies: 'broken' },
    exploration: { discoveredNodes: {}, time: [], weather: null },
    flags: [],
    dungeonRun: 'broken',
  };
  const s = normalizeSave(broken);
  assert.deepEqual(s.party, [null, null, null, null]);
  assert.deepEqual(s.inventory, { items: {}, equipment: {}, currencies: {} });
  assert.deepEqual(s.exploration.discoveredNodes, []);
  assert.deepEqual(s.exploration.time, { day: 1, period: 'morning', tick: 0 });
  assert.deepEqual(s.exploration.weather, {});
  assert.deepEqual(s.flags, {});
  assert.equal(s.dungeonRun, null);
  assert.equal(s.units.mon_001.defId, 'mon_001');
  assert.deepEqual(s.units.mon_001.equippedSkills, []);
});

test('マイグレーションは順番に適用される', () => {
  const migrations = [
    { from: 1, to: 2, migrate: (s) => ({ ...s, gold: s.money, money: undefined }) },
    { from: 2, to: 3, migrate: (s) => ({ ...s, gold: s.gold * 10 }) },
  ];
  const out = migrateSave({ saveVersion: 1, money: 5 }, { migrations, currentVersion: 3 });
  assert.equal(out.saveVersion, 3);
  assert.equal(out.gold, 50);
});

test('バージョン情報が無いセーブは v0 として扱う', () => {
  const migrations = [{ from: 0, to: 1, migrate: (s) => ({ ...s, upgraded: true }) }];
  const out = migrateSave({}, { migrations, currentVersion: 1 });
  assert.equal(out.upgraded, true);
  assert.equal(out.saveVersion, 1);
});

test('ゲームより新しいセーブは読み込みを拒否する', () => {
  assert.throws(() => migrateSave({ saveVersion: 99 }), /新しい/);
});

test('リポジトリ経由でもマイグレーションが走る', () => {
  const storage = createMemoryStorage({ k: JSON.stringify({ saveVersion: 1, legacy: true }) });
  const repo = new SaveRepository(storage, {
    key: 'k',
    currentVersion: 2,
    migrations: [{ from: 1, to: 2, migrate: (s) => ({ ...s, migrated: true }) }],
  });
  const s = repo.load();
  assert.equal(s.saveVersion, 2);
  assert.equal(s.migrated, true);
});
