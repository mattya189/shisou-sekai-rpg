import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPartySlot, partyMembers } from '../../src/progression/party.js';
import { grantUnit } from '../../src/progression/units.js';
import { newGameFixture } from '../helpers.js';

test('空き枠に入れられる', async () => {
  const { data, save } = await newGameFixture();
  grantUnit(save, data, 'mon_002');
  setPartySlot(save, data, 3, 'mon_002');
  assert.deepEqual(save.party, ['chr_001', 'chr_002', 'mon_001', 'mon_002']);
});

test('すでに編成中のユニットを別枠に入れると入れ替わる', async () => {
  const { data, save } = await newGameFixture();
  setPartySlot(save, data, 0, 'mon_001');
  assert.deepEqual(save.party, ['mon_001', 'chr_002', 'chr_001', null]);
});

test('人間とモンスターを自由に混成でき、モンスター4体も可能', async () => {
  const { data, save } = await newGameFixture();
  for (const id of ['mon_002', 'mon_003', 'mon_004']) grantUnit(save, data, id);
  setPartySlot(save, data, 0, 'mon_002');
  setPartySlot(save, data, 1, 'mon_003');
  setPartySlot(save, data, 3, 'mon_004');
  assert.deepEqual(save.party, ['mon_002', 'mon_003', 'mon_001', 'mon_004']);
  assert.ok(partyMembers(save).every((id) => save.units[id].kind === 'monster'));
});

test('最後の1体は外せない', async () => {
  const { data, save } = await newGameFixture();
  setPartySlot(save, data, 0, null);
  setPartySlot(save, data, 1, null);
  assert.throws(() => setPartySlot(save, data, 2, null), /最低1体/);
});

test('所持していないユニットや範囲外の枠は拒否する', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => setPartySlot(save, data, 3, 'mon_004'), /所持していません/);
  assert.throws(() => setPartySlot(save, data, 4, 'chr_001'), /枠/);
});
