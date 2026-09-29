import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncStamina, spendStamina, staminaStatus } from '../../src/exploration/stamina.js';
import { SaveRepository } from '../../src/save/saveRepository.js';
import { createMemoryStorage } from '../../src/save/storageAdapters.js';
import { newGameFixture } from '../helpers.js';

test('スタミナ上限と新規開始値は300', async () => {
  const { data, save } = await newGameFixture();
  assert.equal(data.balance.actionPoints.cap, 300);
  assert.equal(save.exploration.maxActionPoints, 300);
  assert.equal(save.exploration.actionPoints, 300);
});

test('30秒につき1回復し、30秒未満の端数を次回へ保持する', async () => {
  const { data, save } = await newGameFixture();
  save.exploration.actionPoints = 290;
  save.exploration.staminaUpdatedAt = 1_000;
  let result = syncStamina(save, data, 46_000);
  assert.equal(result.recovered, 1);
  assert.equal(save.exploration.actionPoints, 291);
  assert.equal(save.exploration.staminaUpdatedAt, 31_000);
  assert.equal(result.nextRecoveryMs, 15_000);
  result = syncStamina(save, data, 61_000);
  assert.equal(result.recovered, 1);
  assert.equal(save.exploration.actionPoints, 292);
});

test('オフライン経過分をfloorで回復し、300を超えない', async () => {
  const { data, save } = await newGameFixture();
  save.exploration.actionPoints = 298;
  save.exploration.staminaUpdatedAt = 10_000;
  const result = syncStamina(save, data, 105_000);
  assert.equal(result.recovered, 2);
  assert.equal(save.exploration.actionPoints, 300);
  assert.equal(staminaStatus(save, data, 999_999).nextRecoveryMs, null);
});

test('満タンから行動した時点を次回回復の基準にする', async () => {
  const { data, save } = await newGameFixture();
  save.exploration.staminaUpdatedAt = 1_000;
  spendStamina(save, data, 2, 100_000);
  assert.equal(save.exploration.actionPoints, 298);
  assert.equal(save.exploration.staminaUpdatedAt, 100_000);
  syncStamina(save, data, 129_999);
  assert.equal(save.exploration.actionPoints, 298);
  syncStamina(save, data, 130_000);
  assert.equal(save.exploration.actionPoints, 299);
});

test('旧v1セーブは既存データを保ったまま最大300へ移行できる', async () => {
  const storage = createMemoryStorage({
    old: JSON.stringify({
      saveVersion: 1,
      units: {},
      exploration: { townId: 'town_001', locationId: 'loc_002', actionPoints: 6, maxActionPoints: 6 },
      legacyProgress: { kept: true },
    }),
  });
  const loaded = new SaveRepository(storage, { key: 'old' }).load();
  assert.equal(loaded.saveVersion, 2);
  assert.equal(loaded.exploration.actionPoints, 300);
  assert.equal(loaded.exploration.maxActionPoints, 300);
  assert.equal(loaded.exploration.adventureId, 'loc_002');
  assert.deepEqual(loaded.legacyProgress, { kept: true });
});

test('保存・再読込後もスタミナ時刻と端数が復元される', async () => {
  const { save } = await newGameFixture();
  save.exploration.actionPoints = 200;
  save.exploration.staminaUpdatedAt = 123_456;
  const storage = createMemoryStorage();
  const repo = new SaveRepository(storage, { now: () => '2026-09-29T00:00:00.000Z' });
  repo.save(save);
  const loaded = repo.load();
  assert.equal(loaded.exploration.actionPoints, 200);
  assert.equal(loaded.exploration.staminaUpdatedAt, 123_456);
});
