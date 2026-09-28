import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, advance } from '../../src/battle/engine.js';
import { loadBattleData, loadRealData } from '../helpers.js';

const prismaria = (over = {}) => ({ defId: 'mon_009', level: 25, rank: 5, usesMp: false, ...over });
const sandbag = (over = {}) => ({ defId: 'mon_900', ...over });
const action = (battle, id = 'a1') => battle.log.filter((e) => e.type === 'action' && e.actorId === id).at(-1);
const marker = (unit, stacks) => { unit.markers.marker_001 = { stacks, reachedMaxAt: null }; };

test('彩核は5色・同色重複を保持でき、合計5個で止まる', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [{ defId: 'chr_900', skills: [] }], enemies: [prismaria({ rank: 3, skills: ['skill_043'] })], seed: 1 });
  const p = b.units[1];
  p.resources.prismCores = { items: ['red', 'red', 'blue', 'green'] };
  p.hp = Math.ceil(p.maxHp * 0.55);
  advance(b, data, 2000);
  assert.equal(p.resources.prismCores.items.length, 5);
  assert.equal(new Set(p.resources.prismCores.items).size >= 3, true);
  assert.equal(b.log.filter((e) => e.skillId === 'skill_043').length, 1);
  advance(b, data, 10000);
  assert.equal(b.log.filter((e) => e.skillId === 'skill_043').length, 1, '万彩解放は戦闘中1回だけ');
});

test('色彩捕食は各敵から侵色を最大5吸収し、今回の合計10につき彩核1個（余剰切り捨て）', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [prismaria({ skills: ['skill_036'] })], enemies: [sandbag(), sandbag()], seed: 2 });
  b.units[0].attackCount = 4;
  marker(b.units[1], 8);
  marker(b.units[2], 7);
  advance(b, data, 2450);
  assert.deepEqual([b.units[1].markers.marker_001.stacks, b.units[2].markers.marker_001.stacks], [3, 2]);
  assert.equal(b.units[0].resources.prismCores.items.length, 1);
  assert.equal(action(b).results.find((r) => r.kind === 'markerAbsorbed').remainder, 0);
});

test('混色魔法は対応する異なる彩核2個を消費して組み合わせ効果を出す', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [prismaria({ skills: ['skill_042'] })], enemies: [sandbag()], seed: 3 });
  b.units[0].resources.prismCores = { items: ['red', 'blue', 'red'] };
  advance(b, data, 2450);
  assert.deepEqual(b.units[0].resources.prismCores.items, ['red']);
  assert.ok(action(b).results.some((r) => r.kind === 'damage'));
});

test('☆5奥義は5色を消費して5属性5ヒットし、侵色+10でも攻撃回数は1だけ', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [prismaria({ skills: ['skill_044'] })], enemies: [sandbag()], seed: 4 });
  b.units[0].resources.prismCores = { items: ['red', 'blue', 'yellow', 'green', 'purple'] };
  advance(b, data, 2450);
  const a = action(b);
  assert.equal(a.skillId, 'skill_044');
  assert.equal(a.results.filter((r) => r.kind === 'damage').length, 5);
  assert.equal(b.units[0].attackCount, 1);
  assert.equal(b.units[1].markers.marker_001.stacks, 10);
  assert.equal(b.units[0].resources.prismCores.items.length, 1, '最後の侵色+10を万彩吸収が数え、新しい彩核を1個生成する');
  advance(b, data, 2450);
  assert.equal(b.log.filter((e) => e.skillId === 'skill_044').length, 1);
});

test('☆3強敵には奥義がなく、地点データから任意強敵として再利用可能に登録される', async () => {
  const data = await loadRealData();
  const optional = data.get('locations', 'loc_001').optionalEncounters[0];
  assert.equal(optional.enemies[0].defId, 'mon_009');
  assert.equal(optional.enemies[0].rank, 3);
  assert.equal(optional.enemies[0].level, 22);
  assert.ok(optional.enemies[0].skills.includes('skill_043'));
  assert.ok(!optional.enemies[0].skills.includes('skill_044'));
  const def = data.get('monsters', 'mon_009');
  assert.equal(def.initialRank, 3);
  assert.equal(def.learnset.length, 10);
});
