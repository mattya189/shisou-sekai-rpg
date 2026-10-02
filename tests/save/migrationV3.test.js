import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateSave } from '../../src/save/migrations.js';
import { CURRENT_SAVE_VERSION } from '../../src/save/saveSchema.js';
import { alliesFromParty } from '../../src/battle/setup.js';
import { newGameFixture } from '../helpers.js';

test('v2の4体編成は3枠へ詰め、4体目は控えに戻る（ユニットは消えない）', () => {
  const units = { a: { defId: 'a' }, b: { defId: 'b' }, c: { defId: 'c' }, d: { defId: 'd' } };
  const out = migrateSave({ saveVersion: 2, party: ['a', null, 'b', 'd'], units: { ...units } });
  assert.equal(out.saveVersion, CURRENT_SAVE_VERSION);
  assert.deepEqual(out.party, ['a', 'b', 'd']);
  assert.deepEqual(Object.keys(out.units), ['a', 'b', 'c', 'd']);
  const full = migrateSave({ saveVersion: 2, party: ['a', 'b', 'c', 'd'], units });
  assert.deepEqual(full.party, ['a', 'b', 'c']);
});

test('出撃は編成枠数（3体）までに制限される', async () => {
  const { data, save } = await newGameFixture();
  save.party = [...save.party, 'chr_001'];
  assert.equal(alliesFromParty(save, data).length, 3);
});
