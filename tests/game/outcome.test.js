import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import { createBattle, runToEnd } from '../../src/battle/engine.js';
import { alliesFromParty } from '../../src/battle/setup.js';
import { applyBattleOutcome } from '../../src/game/battleOutcome.js';
import { recruitChance, tryRecruit, recruitAfterBattle } from '../../src/game/recruit.js';
import { restAtInn } from '../../src/game/inn.js';
import { useItem } from '../../src/progression/consumables.js';
import { currentHp, setCurrentHp } from '../../src/progression/hp.js';
import { unitStats } from '../../src/progression/stats.js';
import { countItem, getCurrency, addItem } from '../../src/progression/inventory.js';
import { moveTo } from '../../src/exploration/map.js';
import { newGameFixture } from '../helpers.js';

function fight(data, save, enemies, seed = 1) {
  return runToEnd(createBattle(data, { allies: alliesFromParty(save, data), enemies, seed }), data);
}

// ---------------------------------------------------------------- 加入

test('加入率 = 基礎率 + 失敗補正 × 失敗回数、一定回数失敗で確定', async () => {
  const { data, save } = await newGameFixture();
  const r = data.get('monsters', 'mon_002').recruit;
  assert.equal(recruitChance(save, data, 'mon_002'), r.baseRate);
  save.recruit.failCounts.mon_002 = 3;
  assert.equal(recruitChance(save, data, 'mon_002'), r.baseRate + r.failBonus * 3);
  save.recruit.failCounts.mon_002 = r.guaranteeAfter;
  assert.equal(recruitChance(save, data, 'mon_002'), 1);
});

test('失敗すると回数が増え、成功すると0に戻って仲間になる', async () => {
  const { data, save } = await newGameFixture();
  const never = { next: () => 0.9999 };
  const always = { next: () => 0 };
  tryRecruit(save, data, 'mon_002', 4, never);
  tryRecruit(save, data, 'mon_002', 4, never);
  assert.equal(save.recruit.failCounts.mon_002, 2);
  const r = tryRecruit(save, data, 'mon_002', 4, always);
  assert.equal(r.success, true);
  assert.equal(save.recruit.failCounts.mon_002, 0);
  assert.equal(save.units.mon_002.level, 4);
});

test('失敗が続いても guaranteeAfter 回で必ず加入する', async () => {
  const { data, save } = await newGameFixture();
  const never = { next: () => 0.9999 };
  const n = data.get('monsters', 'mon_004').recruit.guaranteeAfter;
  for (let i = 0; i < n; i++) assert.equal(tryRecruit(save, data, 'mon_004', 1, never).success, false);
  assert.equal(tryRecruit(save, data, 'mon_004', 1, never).success, true);
});

test('所持済みの種類が加入すると素材に変換される', async () => {
  const { data, save } = await newGameFixture();
  const before = countItem(save, 'item_009');
  const r = tryRecruit(save, data, 'mon_001', 3, { next: () => 0 });
  assert.equal(r.grant.status, 'duplicate');
  assert.equal(countItem(save, 'item_009') - before, 3);
});

test('1戦闘で加入するのは1体まで、同じ種類は1回だけ判定', async () => {
  const { data, save } = await newGameFixture();
  const always = { next: () => 0 };
  const r = recruitAfterBattle(save, data, [{ defId: 'mon_002', level: 3 }, { defId: 'mon_002', level: 5 }, { defId: 'mon_003', level: 3 }], always);
  assert.equal(r.length, 1);
  assert.equal(save.units.mon_002.level, 5);
  assert.equal(save.units.mon_003, undefined);
});

// ---------------------------------------------------------------- 戦闘結果

test('勝利: 経験値・ゴールド・ドロップが入り、HPは持ち越す', async () => {
  const { data, save } = await newGameFixture();
  const gold = getCurrency(save, 'cur_001');
  const b = fight(data, save, [{ defId: 'mon_001', level: 2 }, { defId: 'mon_002', level: 2 }]);
  assert.equal(b.outcome, 'won');
  const s = applyBattleOutcome(save, data, b, createRng(3));
  assert.ok(s.exp.length >= 1 && s.exp[0].amount > 0);
  assert.equal(getCurrency(save, 'cur_001'), gold + s.gold);
  for (const d of s.drops) assert.ok(countItem(save, d.itemId, d.quality) >= d.qty);
  // 戦闘後のHPがセーブに残る（満タンでなければ）
  const hurt = b.units.find((u) => u.side === 'ally' && u.hp < u.maxHp);
  if (hurt) assert.equal(save.units[hurt.unitId].currentHp, hurt.hp);
  assert.equal(save.codex.monsters.mon_002.flags.defeated, true);
});

test('経験値は敵のレベルが高いほど多い', async () => {
  const f1 = await newGameFixture();
  const f2 = await newGameFixture();
  const s1 = applyBattleOutcome(f1.save, f1.data, fight(f1.data, f1.save, [{ defId: 'mon_001', level: 1 }]), createRng(1));
  const s2 = applyBattleOutcome(f2.save, f2.data, fight(f2.data, f2.save, [{ defId: 'mon_001', level: 5 }]), createRng(1));
  assert.ok(s2.exp[0].amount > s1.exp[0].amount);
});

test('前の戦闘で減ったHPのまま次の戦闘が始まる', async () => {
  const { data, save } = await newGameFixture();
  setCurrentHp(save, data, 'chr_001', 50);
  const allies = alliesFromParty(save, data);
  assert.equal(allies.find((a) => a.unitId === 'chr_001').hp, 50);
});

test('全滅すると街へ戻り、HPは1になる', async () => {
  const { data, save } = await newGameFixture();
  moveTo(save, data, 'loc_001', createRng(1));
  const b = fight(data, save, [{ defId: 'mon_004', level: 40 }, { defId: 'mon_004', level: 40 }]);
  assert.equal(b.outcome, 'lost');
  const s = applyBattleOutcome(save, data, b, createRng(1));
  assert.equal(s.returnedToTown, true);
  assert.equal(save.exploration.locationId, null);
  for (const id of save.party) if (id) assert.equal(currentHp(save, data, id), 1);
  assert.equal(s.exp.length, 0);
});

test('HPを反映しない設定（デバッグ戦闘用）', async () => {
  const { data, save } = await newGameFixture();
  const b = fight(data, save, [{ defId: 'mon_004', level: 6 }]);
  applyBattleOutcome(save, data, b, createRng(1), { applyHp: false });
  for (const id of save.party) if (id) assert.equal(save.units[id].currentHp, null);
});

// ---------------------------------------------------------------- 宿屋・消耗品

test('宿屋: スタミナとHPが全回復し、翌朝になり、宿代を払う', async () => {
  const { data, save } = await newGameFixture();
  save.exploration.actionPoints = 0;
  setCurrentHp(save, data, 'chr_001', 1);
  save.exploration.time.period = 'night';
  const gold = getCurrency(save, 'cur_001');
  restAtInn(save, data, createRng(1));
  assert.equal(save.exploration.actionPoints, save.exploration.maxActionPoints);
  assert.equal(save.units.chr_001.currentHp, null);
  assert.equal(save.exploration.time.day, 2);
  assert.equal(save.exploration.time.period, 'morning');
  assert.equal(getCurrency(save, 'cur_001'), gold - data.balance.inn.cost);
});

test('宿屋は街の中でしか使えず、お金が足りないと泊まれない', async () => {
  const { data, save } = await newGameFixture();
  save.inventory.currencies.cur_001 = 0;
  assert.throws(() => restAtInn(save, data, createRng(1)), /足りません/);
  save.inventory.currencies.cur_001 = 100;
  moveTo(save, data, 'loc_001', createRng(1));
  assert.throws(() => restAtInn(save, data, createRng(1)), /街の中/);
});

test('薬草でHP回復。品質が高いほど回復量が多い', async () => {
  const { data, save } = await newGameFixture();
  const max = unitStats(save, data, 'chr_001').hp;
  setCurrentHp(save, data, 'chr_001', 1);
  const q1 = useItem(save, data, 'item_002', 'q1', 'chr_001').healed;
  assert.equal(q1, Math.floor(max * 0.3));
  addItem(save, data, 'item_002', 1, 'q5');
  setCurrentHp(save, data, 'chr_001', 1);
  const q5 = useItem(save, data, 'item_002', 'q5', 'chr_001').healed;
  assert.equal(q5, Math.floor(max * 0.3 * 1.5));
  assert.equal(countItem(save, 'item_002', 'q1'), 4);
});

test('HP満タンや消耗品以外には使えない（アイテムは減らない）', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => useItem(save, data, 'item_002', 'q1', 'chr_001'), /満タン/);
  assert.equal(countItem(save, 'item_002', 'q1'), 5);
  assert.throws(() => useItem(save, data, 'item_001', 'q1', 'chr_001'), /使えません/);
});

test('倒れたユニットにも薬草は使える', async () => {
  const { data, save } = await newGameFixture();
  setCurrentHp(save, data, 'chr_002', 0);
  useItem(save, data, 'item_002', 'q1', 'chr_002');
  assert.ok(currentHp(save, data, 'chr_002') > 0);
});
