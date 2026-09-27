import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, advance, effectiveStat } from '../../src/battle/engine.js';
import { learnedSkillIds, setEquippedSkills } from '../../src/progression/skillLoadout.js';
import { loadBattleData, loadRealData } from '../helpers.js';

const someime = (over = {}) => ({ defId: 'mon_007', level: 40, rank: 5, usesMp: false, ...over });
const sandbag = (over = {}) => ({ defId: 'mon_900', ...over });
const marker = (unit, stacks, reachedMaxAt = null) => {
  unit.markers.marker_001 = { stacks, reachedMaxAt };
};
const action = (battle, actorId = 'a1') => battle.log.filter((e) => e.type === 'action' && e.actorId === actorId).at(-1);

test('ソメイム: 通常攻撃命中で侵色+1', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: [] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 1450);
  assert.equal(b.units[1].markers.marker_001.stacks, 1);
});

test('ソメイム: 侵色は100を超えない', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: [] })], enemies: [sandbag()], seed: 1 });
  marker(b.units[1], 100, 0);
  advance(b, data, 1450);
  assert.equal(b.units[1].markers.marker_001.stacks, 100);
});

test('侵色弾は3の倍数回の攻撃で発動する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_015'] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 4350);
  assert.deepEqual(b.log.filter((e) => e.actorId === 'a1').map((e) => e.skillId), [null, null, 'skill_015']);
});

test('侵色弾の威力は侵色量で増加する', async () => {
  const data = await loadBattleData();
  const damageAt = (stacks) => {
    const b = createBattle(data, { allies: [someime({ skills: ['skill_015'] })], enemies: [sandbag()], seed: 1 });
    b.units[0].attackCount = 2;
    marker(b.units[1], stacks);
    advance(b, data, 1450);
    return action(b).results.find((r) => r.kind === 'damage').amount;
  };
  assert.ok(damageAt(10) > damageAt(0));
  assert.ok(damageAt(100) > damageAt(10));
});

test('インク飛ばしは侵色+5と速度低下を付与する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_016'] })], enemies: [sandbag()], seed: 1 });
  b.units[0].attackCount = 4;
  advance(b, data, 1450);
  assert.equal(b.units[1].markers.marker_001.stacks, 5);
  assert.ok(b.units[1].statuses.some((s) => s.statusId === 'status_005'));
});

test('侵色100で侵色支配が発動可能になる', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_017'] })], enemies: [sandbag()], seed: 1 });
  marker(b.units[1], 100, 0);
  advance(b, data, 1450);
  assert.equal(action(b).skillId, 'skill_017');
  assert.ok(b.units[1].statuses.some((s) => s.statusId === 'status_006'));
});

test('侵色支配は対象自身の2ターン継続する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_017'] })], enemies: [{ defId: 'mon_901', skills: [] }], seed: 1 });
  marker(b.units[1], 100, 0);
  advance(b, data, 1450);
  b.units[0].nextAttackAt = 10_000_000;
  advance(b, data, 1600);
  assert.equal(b.units[1].statuses.some((s) => s.statusId === 'status_006'), false);
});

test('侵色支配は対象の行動終了時ごとに最大HP10%を失わせる', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_017'] })], enemies: [{ defId: 'mon_901', skills: [] }], seed: 1 });
  marker(b.units[1], 100, 0);
  advance(b, data, 1450);
  b.units[0].nextAttackAt = 10_000_000;
  const before = b.units[1].hp;
  advance(b, data, 600);
  assert.equal(before - b.units[1].hp, Math.floor(b.units[1].maxHp * 0.1));
});

test('お絵描き発動時はターンだけ進み攻撃回数は増えない', async () => {
  const data = await loadBattleData((raw) => { raw.skills.find((s) => s.id === 'skill_019').trigger.chance = 1; });
  const b = createBattle(data, { allies: [someime({ skills: ['skill_019'] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 1450);
  assert.deepEqual([b.units[0].turnCount, b.units[0].attackCount, action(b).countsAsAttack], [1, 0, false]);
});

test('お絵描き完成時に全戦闘能力+5%が付く', async () => {
  const data = await loadBattleData((raw) => { raw.skills.find((s) => s.id === 'skill_019').trigger.chance = 1; });
  const b = createBattle(data, { allies: [someime({ skills: ['skill_019'] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 2900);
  assert.ok(b.units[0].statuses.some((s) => s.statusId === 'status_007'));
  assert.equal(effectiveStat(b.units[0], 'matk'), b.units[0].stats.matk * 1.05);
  assert.equal(action(b).kind, 'normal', '完成処理は本来の攻撃をキャンセルしない');
});

test('お絵描き完成の強化は完成行動を含め3ターン継続する', async () => {
  const data = await loadBattleData((raw) => { raw.skills.find((s) => s.id === 'skill_019').trigger.chance = 1; });
  const b = createBattle(data, { allies: [someime({ skills: ['skill_019'] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 1450);
  data.get('skills', 'skill_019').trigger.chance = 0;
  advance(b, data, 2900);
  assert.ok(b.units[0].statuses.some((s) => s.statusId === 'status_007'));
  advance(b, data, 1450);
  assert.equal(b.units[0].statuses.some((s) => s.statusId === 'status_007'), false);
});

test('魔法のお絵描きはお絵描き完成時に有効化する', async () => {
  const data = await loadBattleData((raw) => { raw.skills.find((s) => s.id === 'skill_019').trigger.chance = 1; });
  const b = createBattle(data, { allies: [someime({ skills: ['skill_019', 'skill_021'] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 2900);
  assert.ok(b.units[0].statuses.some((s) => s.statusId === 'status_008'));
});

test('魔法のお絵描き追加攻撃は敵全体へ当たり攻撃回数を余分に増やさない', async () => {
  const data = await loadBattleData((raw) => { raw.skills.find((s) => s.id === 'skill_019').trigger.chance = 1; });
  const b = createBattle(data, { allies: [someime({ skills: ['skill_019', 'skill_021'] })], enemies: [sandbag(), sandbag()], seed: 1 });
  advance(b, data, 2900);
  assert.equal(b.units[0].attackCount, 1);
  assert.equal(action(b).results.filter((r) => r.kind === 'damage').length, 3);
  assert.deepEqual(b.units.slice(1).map((u) => u.markers.marker_001.stacks), [2, 1]);
});

test('インクを撒き散らすは各敵へ個別に1～5侵色を付与する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_022'] })], enemies: [sandbag(), sandbag(), sandbag()], seed: 7 });
  b.units[0].attackCount = 5;
  advance(b, data, 1450);
  const values = b.units.slice(1).map((u) => u.markers.marker_001.stacks);
  assert.ok(values.every((v) => v >= 1 && v <= 5));
  assert.equal(values.length, 3);
});

test('インクを撒き散らすはseed固定で再現できる', async () => {
  const data = await loadBattleData();
  const run = () => {
    const b = createBattle(data, { allies: [someime({ skills: ['skill_022'] })], enemies: [sandbag(), sandbag(), sandbag()], seed: 77 });
    b.units[0].attackCount = 5;
    advance(b, data, 1450);
    return b.units.slice(1).map((u) => u.markers.marker_001.stacks);
  };
  assert.deepEqual(run(), run());
});

test('ソメソメスラッシュは侵色合計30未満では発動しない', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_023'] })], enemies: [sandbag(), sandbag()], seed: 1 });
  b.units[0].attackCount = 1;
  marker(b.units[1], 10); marker(b.units[2], 19);
  advance(b, data, 1450);
  assert.equal(action(b).kind, 'normal');
});

test('ソメソメスラッシュは侵色合計30以上かつ偶数回目で発動する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_023'] })], enemies: [sandbag(), sandbag()], seed: 1 });
  b.units[0].attackCount = 1;
  marker(b.units[1], 10); marker(b.units[2], 20);
  advance(b, data, 1450);
  assert.equal(action(b).skillId, 'skill_023');
});

test('ソメソメスラッシュは1戦闘に1回だけ', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_023'] })], enemies: [sandbag(), sandbag()], seed: 1 });
  b.units[0].attackCount = 1; marker(b.units[1], 30);
  advance(b, data, 1450);
  b.units[0].attackCount = 3; marker(b.units[1], 30);
  advance(b, data, 1450);
  assert.equal(b.log.filter((e) => e.skillId === 'skill_023').length, 1);
});

test('ソメソメスラッシュは侵色を最多の敵へ集約する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_023'] })], enemies: [sandbag(), sandbag(), sandbag()], seed: 1 });
  b.units[0].attackCount = 1;
  marker(b.units[1], 10); marker(b.units[2], 20); marker(b.units[3], 5);
  advance(b, data, 1450);
  assert.deepEqual(b.units.slice(1).map((u) => u.markers.marker_001.stacks), [0, 35, 0]);
});

test('侵色集約後も100を超えず超過分は消える', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_023'] })], enemies: [sandbag(), sandbag()], seed: 1 });
  b.units[0].attackCount = 1; marker(b.units[1], 90); marker(b.units[2], 80);
  advance(b, data, 1450);
  assert.deepEqual(b.units.slice(1).map((u) => u.markers.marker_001.stacks), [100, 0]);
  assert.equal(action(b).results.find((r) => r.kind === 'markerCollected').lost, 70);
});

test('ソメイムの特技習得はランクとレベルのAND条件', async () => {
  const data = await loadRealData();
  const ids = (rank, level) => learnedSkillIds(data, { defId: 'mon_007', rank, level, extraSkills: [] });
  assert.deepEqual(ids(1, 1), ['skill_015', 'skill_019']);
  assert.ok(ids(1, 40).includes('skill_016'));
  assert.equal(ids(1, 40).includes('skill_017'), false);
  assert.ok(ids(3, 20).includes('skill_021'));
  assert.equal(ids(3, 40).includes('skill_022'), false);
  assert.equal(ids(5, 40).length, 10);
});

test('ソメイムも最大5特技セット制限に従う', async () => {
  const data = await loadRealData();
  const unit = { defId: 'mon_007', rank: 5, level: 40, extraSkills: [], equippedSkills: [] };
  const save = { units: { someime: unit } };
  const learned = learnedSkillIds(data, unit);
  setEquippedSkills(save, data, 'someime', learned.slice(0, 5));
  assert.equal(unit.equippedSkills.length, 5);
  assert.throws(() => setEquippedSkills(save, data, 'someime', learned.slice(0, 6)), /5個まで/);
});
