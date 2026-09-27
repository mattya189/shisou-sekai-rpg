import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import { monsterEntry, itemEntry, codexProgress } from '../../src/codex/codex.js';
import { monsterHabitats, itemSources } from '../../src/codex/lookup.js';
import { markMonster, countMonster } from '../../src/progression/codex.js';
import { performExploreAction } from '../../src/exploration/actions.js';
import { moveTo } from '../../src/exploration/map.js';
import { newGameFixture, loadRealData, loadModifiedData } from '../helpers.js';

test('出会う前は何もわからない', async () => {
  const { data, save } = await newGameFixture();
  const e = monsterEntry(save, data, 'mon_004');
  assert.equal(e.known, false);
  assert.equal(e.reveals.size, 0);
});

test('遭遇→撃破→5体撃破→加入で情報が段階的に開く', async () => {
  const { data, save } = await newGameFixture();
  markMonster(save, 'mon_004', 'encountered');
  assert.deepEqual([...monsterEntry(save, data, 'mon_004').reveals].sort(), ['basic', 'habitat']);
  markMonster(save, 'mon_004', 'defeated');
  countMonster(save, 'mon_004', 'defeated');
  assert.ok(monsterEntry(save, data, 'mon_004').reveals.has('stats'));
  assert.ok(!monsterEntry(save, data, 'mon_004').reveals.has('skills'));
  countMonster(save, 'mon_004', 'defeated', 4);
  assert.ok(monsterEntry(save, data, 'mon_004').reveals.has('skills'));
  assert.ok(!monsterEntry(save, data, 'mon_004').reveals.has('recruit'));
  // 仲間にすると（撃破していなくても）能力が見える
  markMonster(save, 'mon_003', 'encountered');
  markMonster(save, 'mon_003', 'recruited');
  assert.ok(monsterEntry(save, data, 'mon_003').reveals.has('stats'));
  markMonster(save, 'mon_004', 'recruited');
  const e = monsterEntry(save, data, 'mon_004');
  assert.ok(e.reveals.has('recruit') && e.reveals.has('passives'));
  assert.ok(e.stages.every((s) => s.done));
});

test('モンスターごとに追加の段階（イベントのフラグで開く、など）を足せる', async () => {
  const data = await loadModifiedData((raw) => {
    raw.monsters.find((m) => m.id === 'mon_002').codexStages = [
      { id: 'secret', name: '秘密', requires: { type: 'saveFlag', flag: 'flag_005' }, reveals: ['description'] },
    ];
  });
  const { save } = await newGameFixture();
  markMonster(save, 'mon_002', 'encountered');
  assert.ok(!monsterEntry(save, data, 'mon_002').reveals.has('description'));
  save.flags.flag_005 = true;
  assert.ok(monsterEntry(save, data, 'mon_002').reveals.has('description'));
});

test('出現場所の逆引き（変異種は条件つき、ボスはダンジョン）', async () => {
  const data = await loadRealData();
  const variant = monsterHabitats(data, 'mon_005');
  assert.ok(variant.some((h) => h.nodeId === 'loc_001' && h.whens.some((w) => w?.periods?.includes('night'))));
  const boss = monsterHabitats(data, 'mon_006');
  assert.deepEqual(boss.map((h) => h.kind), ['boss']);
  const trophy = monsterHabitats(data, 'mon_004');
  assert.ok(trophy.some((h) => h.kind === 'dungeon'));
});

test('アイテムの入手方法の逆引き', async () => {
  const data = await loadRealData();
  const kinds = (id) => itemSources(data, id).map((s) => s.kind).sort();
  assert.ok(kinds('item_002').includes('gather') && kinds('item_002').includes('shop') && kinds('item_002').includes('event'));
  assert.deepEqual(kinds('item_010'), ['secret']);
  assert.ok(kinds('item_007').includes('boss'));
  assert.ok(kinds('item_008').includes('recipe') && kinds('item_008').includes('secret'));
  assert.ok(kinds('item_009').includes('duplicate'));
  // すべてのアイテムに入手方法がある（重要アイテムも含む）
  for (const it of data.list('items')) assert.ok(itemSources(data, it.id).length > 0, `${it.id} の入手方法がない`);
});

test('実際に入手した方法と品質が図鑑に記録される', async () => {
  const { data, save } = await newGameFixture();
  const rng = createRng(2);
  moveTo(save, data, 'loc_001', rng);
  let r;
  do {
    save.exploration.actionPoints = 6;
    r = performExploreAction(save, data, 'gather', rng);
  } while (!r.outcome.items.some((i) => i.itemId === 'item_002'));
  const e = itemEntry(save, data, 'item_002');
  assert.equal(e.known, true);
  assert.equal(e.sources.find((s) => s.kind === 'gather' && s.nodeId === 'loc_001').found, true);
  assert.equal(e.sources.find((s) => s.kind === 'shop').found, false);
  assert.ok(e.qualities.some((q) => q.obtained));
});

test('図鑑の達成状況', async () => {
  const { data, save } = await newGameFixture();
  const p = codexProgress(save, data);
  assert.equal(p.monsters.total, data.list('monsters').length);
  assert.equal(p.monsters.recruited, 1); // 開始時のスライム
  assert.equal(p.items.known, 2); // 開始時の薬草と月光草
});
