import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import { createBattle, runToEnd } from '../../src/battle/engine.js';
import { alliesFromParty } from '../../src/battle/setup.js';
import { applyBattleOutcome } from '../../src/game/battleOutcome.js';
import { enterDungeon, nextDungeonBattle, afterDungeonBattle, dungeonEntryStatus, retreatDungeon, dungeonMp } from '../../src/exploration/dungeon.js';
import { moveTo } from '../../src/exploration/map.js';
import { addItem } from '../../src/progression/inventory.js';
import { setLevel } from '../../src/progression/leveling.js';
import { newGameFixture } from '../helpers.js';

async function atEntrance() {
  const f = await newGameFixture();
  const rng = createRng(1);
  f.save.flags.flag_002 = true;
  for (const to of ['loc_001', 'loc_002', 'loc_003', 'loc_004']) moveTo(f.save, f.data, to, rng);
  return { ...f, rng };
}

function fightStage(data, save, rng, seed) {
  const params = nextDungeonBattle(save, data, rng);
  const b = runToEnd(createBattle(data, { allies: alliesFromParty(save, data, { mp: dungeonMp(save) }), enemies: params.enemies, mode: 'dungeon', seed }), data);
  applyBattleOutcome(save, data, b, rng);
  return { b, progress: afterDungeonBattle(save, data, b), params };
}

test('鍵がないと入れない。鍵があればスタミナ2で入れる', async () => {
  const { data, save, rng } = await atEntrance();
  assert.equal(dungeonEntryStatus(save, data, 'dgn_001').ok, false);
  assert.throws(() => enterDungeon(save, data, 'dgn_001', rng), /鍵/);
  addItem(save, data, 'item_010', 1);
  enterDungeon(save, data, 'dgn_001', rng);
  assert.equal(save.exploration.actionPoints, data.balance.actionPoints.initial - data.balance.dungeon.enterAp);
  assert.deepEqual(save.dungeonRun, { dungeonId: 'dgn_001', stage: 0, mp: {} });
});

test('入口以外からは入れない', async () => {
  const { data, save } = await newGameFixture();
  addItem(save, data, 'item_010', 1);
  assert.throws(() => enterDungeon(save, data, 'dgn_001', createRng(1)), /ここからは/);
});

test('連戦: MPを持ち越し、最後はボス、勝てば踏破', async () => {
  const { data, save, rng } = await atEntrance();
  addItem(save, data, 'item_010', 1);
  for (const id of save.party) if (id) setLevel(save, data, id, 60);
  enterDungeon(save, data, 'dgn_001', rng);
  const first = fightStage(data, save, rng, 1);
  assert.equal(first.b.outcome, 'won');
  assert.equal(first.progress.stage, 1);
  // 前の戦闘のMPが次の戦闘の開始MPになる
  const mp = { ...save.dungeonRun.mp };
  const allies = alliesFromParty(save, data, { mp: dungeonMp(save) });
  for (const a of allies) assert.equal(a.mp, mp[a.unitId]);
  fightStage(data, save, rng, 2);
  const boss = fightStage(data, save, rng, 3);
  assert.equal(boss.params.isBoss, true);
  assert.equal(boss.progress.cleared, true);
  assert.equal(save.dungeonRun, null);
  assert.equal(save.dungeons.cleared.dgn_001, 1);
});

test('撤退するとダンジョンから出る', async () => {
  const { data, save, rng } = await atEntrance();
  addItem(save, data, 'item_010', 1);
  enterDungeon(save, data, 'dgn_001', rng);
  retreatDungeon(save);
  assert.equal(save.dungeonRun, null);
});

test('全滅するとダンジョンが終わり街へ戻る', async () => {
  const { data, save, rng } = await atEntrance();
  addItem(save, data, 'item_010', 1);
  enterDungeon(save, data, 'dgn_001', rng);
  save.dungeonRun.stage = 2; // いきなりボス（Lv3では勝てない）
  const r = fightStage(data, save, rng, 4);
  assert.equal(r.b.outcome, 'lost');
  assert.equal(save.dungeonRun, null);
  assert.equal(save.exploration.locationId, null);
});
