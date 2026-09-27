import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import { shopStock, buyItem, buyEquipment, sellItem, itemSellPrice, sellEquipment } from '../../src/town/shop.js';
import { craft, recipeStatus } from '../../src/town/crafting.js';
import { enhanceEquipment, enhanceCost } from '../../src/progression/enhance.js';
import { rankUp, nextRankCost } from '../../src/progression/rankUp.js';
import { triggerEvent, availableEvents } from '../../src/events/events.js';
import { equipToUnit } from '../../src/progression/equipment.js';
import { unitStats } from '../../src/progression/stats.js';
import { addItem, countItem, getCurrency, addCurrency } from '../../src/progression/inventory.js';
import { newGameFixture } from '../helpers.js';

// ---------------------------------------------------------------- ショップ

test('買うとゴールドが減り、アイテムが品質つきで増える', async () => {
  const { data, save } = await newGameFixture();
  const idx = shopStock(save, data, 'shop_001').items.find((e) => e.quality === 'q2').index;
  buyItem(save, data, 'shop_001', idx, 2);
  assert.equal(getCurrency(save, 'cur_001'), 500 - 55 * 2);
  assert.equal(countItem(save, 'item_002', 'q2'), 2);
});

test('お金が足りなければ買えない', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => buyItem(save, data, 'shop_001', 0, 100), /足りません/);
  assert.equal(countItem(save, 'item_002', 'q1'), 5);
});

test('条件付きの商品はフラグが立つまで並ばない', async () => {
  const { data, save } = await newGameFixture();
  const has = () => shopStock(save, data, 'shop_001').equipment.some((e) => e.defId === 'equip_003');
  assert.equal(has(), false);
  save.flags.flag_002 = true;
  assert.equal(has(), true);
});

test('装備を買うと個体が増える', async () => {
  const { data, save } = await newGameFixture();
  const n = Object.keys(save.inventory.equipment).length;
  buyEquipment(save, data, 'shop_001', 0, createRng(1));
  assert.equal(Object.keys(save.inventory.equipment).length, n + 1);
});

test('売値は品質で上がる。重要アイテムは売れない', async () => {
  const { data, save } = await newGameFixture();
  assert.ok(itemSellPrice(data, 'shop_001', 'item_001', 'q5') > itemSellPrice(data, 'shop_001', 'item_001', 'q1'));
  const before = getCurrency(save, 'cur_001');
  const r = sellItem(save, data, 'shop_001', 'item_001', 'q1', 3);
  assert.equal(getCurrency(save, 'cur_001'), before + r.gained);
  assert.equal(countItem(save, 'item_001', 'q1'), 0);
  addItem(save, data, 'item_010', 1);
  assert.throws(() => sellItem(save, data, 'shop_001', 'item_010', 'q1', 1), /売れません/);
});

test('装備中の装備は売れない', async () => {
  const { data, save } = await newGameFixture();
  const uid = save.units.chr_001.equipment[0];
  assert.throws(() => sellEquipment(save, data, 'shop_001', uid), /装備中/);
  equipToUnit(save, data, 'chr_001', 0, null);
  sellEquipment(save, data, 'shop_001', uid);
  assert.equal(save.inventory.equipment[uid], undefined);
});

// ---------------------------------------------------------------- 強化・製作・ランクアップ

test('装備強化: 素材とお金を使って+1、能力が上がる、+10まで', async () => {
  const { data, save } = await newGameFixture();
  const uid = save.units.chr_001.equipment[0];
  const atk = unitStats(save, data, 'chr_001').atk;
  assert.throws(() => enhanceEquipment(save, data, uid), /足りません/);
  addItem(save, data, 'item_008', 100);
  addCurrency(save, data, 'cur_001', 100000);
  enhanceEquipment(save, data, uid);
  assert.equal(save.inventory.equipment[uid].plus, 1);
  assert.equal(unitStats(save, data, 'chr_001').atk, atk + 1);
  for (let i = 1; i < 10; i++) enhanceEquipment(save, data, uid);
  assert.equal(save.inventory.equipment[uid].plus, 10);
  assert.throws(() => enhanceEquipment(save, data, uid), /これ以上/);
  assert.ok(enhanceCost(data, 9).qty > enhanceCost(data, 0).qty);
});

test('製作: 品質条件つきの素材は条件以上の品質だけを使う', async () => {
  const { data, save } = await newGameFixture();
  addItem(save, data, 'item_005', 3);
  // 月光草は 普通×3・良質×1。良質以上が2つ必要 → 足りない
  assert.equal(recipeStatus(save, data, 'recipe_001').canCraft, false);
  addItem(save, data, 'item_001', 1, 'q4');
  assert.equal(recipeStatus(save, data, 'recipe_001').canCraft, true);
  const r = craft(save, data, 'recipe_001', createRng(1));
  assert.equal(r.equipment.defId, 'equip_003');
  assert.equal(countItem(save, 'item_001', 'q1'), 3, '普通は使わない');
  assert.equal(countItem(save, 'item_001', 'q2') + countItem(save, 'item_001', 'q4'), 0);
});

test('製作: 素材が足りなければ何も減らない', async () => {
  const { data, save } = await newGameFixture();
  addItem(save, data, 'item_006', 2);
  assert.throws(() => craft(save, data, 'recipe_003', createRng(1)), /足りません/);
  assert.equal(countItem(save, 'item_006'), 2);
});

test('ランクアップ: 素材を使って能力が上がる。最大ランクで止まる', async () => {
  const { data, save } = await newGameFixture();
  const hp = unitStats(save, data, 'mon_001').hp;
  assert.equal(nextRankCost(save, data, 'mon_001').canPay, false);
  assert.throws(() => rankUp(save, data, 'mon_001'), /足りません/);
  addItem(save, data, 'item_007', 100);
  addItem(save, data, 'item_009', 100);
  addCurrency(save, data, 'cur_001', 100000);
  rankUp(save, data, 'mon_001');
  assert.equal(save.units.mon_001.rank, 2);
  assert.ok(unitStats(save, data, 'mon_001').hp > hp);
  assert.equal(countItem(save, 'item_007'), 99);
  while (nextRankCost(save, data, 'mon_001')) rankUp(save, data, 'mon_001');
  assert.throws(() => rankUp(save, data, 'mon_001'), /これ以上/);
});

// ---------------------------------------------------------------- イベント

test('一度きりのイベントは二度起きない', async () => {
  const { data, save } = await newGameFixture();
  const rng = createRng(1);
  let got = false;
  for (let i = 0; i < 50; i++) {
    const r = triggerEvent(save, data, 'residents', 'town_001', rng);
    if (r.eventId === 'event_002') {
      assert.equal(got, false);
      got = true;
    }
  }
  assert.equal(got, true);
  assert.equal(countItem(save, 'item_002', 'q2'), 3);
});

test('イベントは時間帯・フラグの条件で変わる', async () => {
  const { data, save } = await newGameFixture();
  const ids = () => availableEvents(save, data, 'tavern', 'town_001').map((e) => e.id);
  assert.ok(ids().includes('event_004'));
  assert.ok(!ids().includes('event_005'));
  save.flags.flag_002 = true;
  assert.ok(!ids().includes('event_004'));
  assert.ok(ids().includes('event_005'));
  save.exploration.time.period = 'night';
  assert.ok(availableEvents(save, data, 'residents', 'town_001').some((e) => e.id === 'event_003'));
});

test('イベントでフラグが立つ', async () => {
  const { data, save } = await newGameFixture();
  save.exploration.time.period = 'night';
  const rng = createRng(3);
  for (let i = 0; i < 50 && !save.flags.flag_005; i++) triggerEvent(save, data, 'townExplore', 'town_001', rng);
  assert.equal(save.flags.flag_005, true);
});
