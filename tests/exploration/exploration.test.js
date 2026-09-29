import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import { advanceTime, advanceToNextMorning, weatherAt } from '../../src/exploration/time.js';
import { listConnections, moveTo, currentNodeId } from '../../src/exploration/map.js';
import { performExploreAction, startExploreCommand, clearExploreEvent, resolveExploreChoice, EXPLORE_ACTIONS } from '../../src/exploration/actions.js';
import { rollEncounter, possibleMonsters } from '../../src/exploration/encounters.js';
import { matchesWhen } from '../../src/exploration/when.js';
import { rollQuality } from '../../src/progression/quality.js';
import { countItem } from '../../src/progression/inventory.js';
import { setCurrentHp } from '../../src/progression/hp.js';
import { newGameFixture, loadRealData } from '../helpers.js';

// ---------------------------------------------------------------- 時間・天候

test('時間は朝→昼→夕方→夜→翌朝と進む', async () => {
  const { data, save } = await newGameFixture();
  const rng = createRng(1);
  const per = data.balance.time.ticksPerPeriod;
  const seen = [];
  for (let i = 0; i < 5; i++) {
    advanceTime(save, data, per, rng);
    seen.push(`${save.exploration.time.day}:${save.exploration.time.period}`);
  }
  assert.deepEqual(seen, ['1:noon', '1:evening', '1:night', '2:morning', '2:noon']);
});

test('時間帯が変わるまで天候は変わらない', async () => {
  const { data, save } = await newGameFixture();
  const rng = createRng(2);
  const before = { ...save.exploration.weather };
  const r = advanceTime(save, data, 1, rng);
  assert.equal(r.periodsPassed, 0);
  assert.deepEqual(save.exploration.weather, before);
});

test('天候は地域ごとに抽選され、seedが同じなら同じ', async () => {
  const a = await newGameFixture(5);
  const b = await newGameFixture(5);
  const ra = createRng(9);
  const rb = createRng(9);
  for (let i = 0; i < 10; i++) {
    advanceToNextMorning(a.save, a.data, ra);
    advanceToNextMorning(b.save, b.data, rb);
    assert.deepEqual(a.save.exploration.weather, b.save.exploration.weather);
  }
  assert.ok(a.data.has('weathers', weatherAt(a.save, a.data, 'loc_001')));
});

// ---------------------------------------------------------------- 移動

test('街から地点へ移動すると時間が進み、行動力は減らない', async () => {
  const { data, save } = await newGameFixture();
  const ap = save.exploration.actionPoints;
  moveTo(save, data, 'loc_001', createRng(1));
  assert.equal(currentNodeId(save), 'loc_001');
  assert.equal(save.exploration.time.tick, 1);
  assert.equal(save.exploration.actionPoints, ap);
  assert.ok(save.exploration.discoveredNodes.includes('loc_001'));
});

test('つながっていない場所へは行けない', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => moveTo(save, data, 'loc_003', createRng(1)), /行けません/);
});

test('条件付きの道はフラグが立つまで通れない', async () => {
  const { data, save } = await newGameFixture();
  const rng = createRng(1);
  for (const to of ['loc_001', 'loc_002', 'loc_003']) moveTo(save, data, to, rng);
  const toRuins = listConnections(save, data).find((c) => c.to === 'loc_004');
  assert.equal(toRuins.locked, true);
  assert.throws(() => moveTo(save, data, 'loc_004', rng), /通れない/);
  save.flags.flag_002 = true;
  moveTo(save, data, 'loc_004', rng);
  assert.equal(currentNodeId(save), 'loc_004');
});

test('地点から街へ戻れる', async () => {
  const { data, save } = await newGameFixture();
  const rng = createRng(1);
  moveTo(save, data, 'loc_001', rng);
  moveTo(save, data, 'town_001', rng);
  assert.equal(save.exploration.locationId, null);
  assert.equal(currentNodeId(save), 'town_001');
});

// ---------------------------------------------------------------- 探索行動

async function atLocation(locId, seed = 1) {
  const f = await newGameFixture(seed);
  const rng = createRng(seed);
  const path = { loc_001: ['loc_001'], loc_002: ['loc_001', 'loc_002'], loc_003: ['loc_001', 'loc_002', 'loc_003'] }[locId];
  for (const to of path) moveTo(f.save, f.data, to, rng);
  return { ...f, rng };
}

test('探索行動の定義と balance の設定が一致している', async () => {
  const data = await loadRealData();
  assert.deepEqual(Object.keys(EXPLORE_ACTIONS).sort(), Object.keys(data.balance.exploration.actions).sort());
});

test('探索行動は行動力を消費し、時間が進む', async () => {
  const { data, save, rng } = await atLocation('loc_001');
  const tick = save.exploration.time.tick;
  performExploreAction(save, data, 'gather', rng);
  assert.equal(save.exploration.actionPoints, 5);
  assert.equal(save.exploration.time.tick, tick + 1);
  performExploreAction(save, data, 'investigate', rng);
  assert.equal(save.exploration.actionPoints, 3);
});

test('コマンド式探索は1回の入力につき1回だけ行動力を消費する', async () => {
  const { data, save, rng } = await atLocation('loc_001');
  const before = save.exploration.actionPoints;
  const first = startExploreCommand(save, data, 'searchMonsters', rng);
  assert.equal(first.outcome.kind, 'encounter');
  assert.equal(save.exploration.actionPoints, before - data.balance.exploration.actions.searchMonsters.ap);
  const after = save.exploration.actionPoints;
  assert.throws(() => startExploreCommand(save, data, 'searchMonsters', rng), /現在の探索結果/);
  assert.equal(save.exploration.actionPoints, after);
  clearExploreEvent(save);
  assert.equal(save.exploration.pendingEvent, null);
});

test('探索イベントはseed固定時に同じ結果になり、未解決イベントを保存できる', async () => {
  const a = await atLocation('loc_001', 77);
  const b = await atLocation('loc_001', 77);
  const ra = startExploreCommand(a.save, a.data, 'explore', a.rng);
  const rb = startExploreCommand(b.save, b.data, 'explore', b.rng);
  assert.deepEqual(ra.outcome, rb.outcome);
  assert.deepEqual(a.save.exploration.pendingEvent, ra);
});

test('地点の探索イベント表は将来の追加をデータだけで行える', async () => {
  const data = await loadRealData();
  for (const loc of data.list('locations')) {
    assert.ok(loc.explorationEvents?.length > 0);
    assert.ok(loc.explorationEvents.every((event) => event.id && event.type && event.weight > 0 && event.message));
  }
});

test('データ定義の小イベント選択肢は追加APなしで報酬を1回だけ反映する', async () => {
  const { data, save } = await atLocation('loc_002');
  const beforeAp = save.exploration.actionPoints;
  const beforeItems = countItem(save, 'item_001', 'q1');
  save.exploration.pendingEvent = {
    actionId: 'explore',
    nodeId: 'loc_002',
    outcome: {
      kind: 'choice',
      choices: [{ id: 'take', label: '拾う', message: '拾った。', rewards: { items: [{ itemId: 'item_001', quality: 'q1', qty: 1 }] } }],
    },
  };
  resolveExploreChoice(save, data, 'take');
  assert.equal(save.exploration.actionPoints, beforeAp);
  assert.equal(countItem(save, 'item_001', 'q1'), beforeItems + 1);
  assert.throws(() => resolveExploreChoice(save, data, 'take'), /選べる探索イベント/);
  assert.equal(countItem(save, 'item_001', 'q1'), beforeItems + 1);
});

test('行動力が足りなければ行動できない', async () => {
  const { data, save, rng } = await atLocation('loc_001');
  save.exploration.actionPoints = 1;
  assert.throws(() => performExploreAction(save, data, 'investigate', rng), /行動力が足りません/);
  assert.equal(save.exploration.actionPoints, 1);
});

test('街の中では探索できない', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => performExploreAction(save, data, 'gather', createRng(1)), /街の中/);
});

test('採取すると品質つきでアイテムが増え、入手場所が記録される', async () => {
  const { data, save, rng } = await atLocation('loc_001');
  const r = performExploreAction(save, data, 'gather', rng);
  assert.equal(r.outcome.kind, 'items');
  for (const it of r.outcome.items) {
    assert.ok(countItem(save, it.itemId, it.quality) >= it.qty);
    assert.equal(save.codex.items[it.itemId].sources.loc_001, true);
  }
});

test('モンスターを探すと必ずエンカウントする', async () => {
  const { data, save, rng } = await atLocation('loc_001');
  const r = performExploreAction(save, data, 'searchMonsters', rng);
  assert.equal(r.outcome.kind, 'encounter');
  assert.ok(r.outcome.enemies.length >= 1);
});

test('パーティが全員倒れていると戦闘になる行動はできない', async () => {
  const { data, save, rng } = await atLocation('loc_001');
  for (const id of save.party) if (id) setCurrentHp(save, data, id, 0);
  assert.throws(() => performExploreAction(save, data, 'searchMonsters', rng), /倒れています/);
  performExploreAction(save, data, 'gather', rng); // 採取はできる
});

test('詳しく調べると隠し要素が見つかり、フラグが立つ（一度だけ）', async () => {
  const { data, save, rng } = await atLocation('loc_002');
  const r = performExploreAction(save, data, 'investigate', rng);
  assert.equal(r.outcome.kind, 'secret');
  assert.equal(save.flags.flag_001, true);
  assert.equal(countItem(save, 'item_008'), 2);
  save.exploration.actionPoints = 6;
  const r2 = performExploreAction(save, data, 'investigate', rng);
  assert.notEqual(r2.outcome.kind, 'secret');
});

test('丘を調べ続けると遺跡への道が開く', async () => {
  const { data, save, rng } = await atLocation('loc_003');
  for (let i = 0; i < 20 && !save.flags.flag_002; i++) {
    save.exploration.actionPoints = 6;
    performExploreAction(save, data, 'investigate', rng);
  }
  assert.equal(save.flags.flag_002, true);
  assert.equal(listConnections(save, data).find((c) => c.to === 'loc_004').locked, false);
});

// ---------------------------------------------------------------- エンカウント・条件

test('出現条件（時間帯・天候・フラグ）', () => {
  const s = { period: 'night', weatherId: 'weather_003', flags: { flag_001: true } };
  assert.equal(matchesWhen(undefined, s), true);
  assert.equal(matchesWhen({ periods: ['night'] }, s), true);
  assert.equal(matchesWhen({ periods: ['morning'] }, s), false);
  assert.equal(matchesWhen({ periods: ['night'], weathers: ['weather_001'] }, s), false);
  assert.equal(matchesWhen({ flags: ['flag_001'] }, s), true);
  assert.equal(matchesWhen({ notFlags: ['flag_001'] }, s), false);
});

test('変異種は夜の雨・霧などにしか出ない', async () => {
  const data = await loadRealData();
  const day = { period: 'morning', weatherId: 'weather_003', flags: {} };
  const rainyNight = { period: 'night', weatherId: 'weather_003', flags: {} };
  const clearNight = { period: 'night', weatherId: 'weather_001', flags: {} };
  assert.ok(!possibleMonsters(data, 'enc_001', day).includes('mon_005'));
  assert.ok(!possibleMonsters(data, 'enc_001', clearNight).includes('mon_005'));
  assert.ok(possibleMonsters(data, 'enc_001', rainyNight).includes('mon_005'));
});

test('エンカウントの敵レベルは指定範囲内', async () => {
  const data = await loadRealData();
  const rng = createRng(3);
  for (let i = 0; i < 200; i++) {
    for (const e of rollEncounter(data, 'enc_003', { period: 'noon', weatherId: 'weather_001', flags: {} }, rng)) {
      assert.ok(e.level >= 5 && e.level <= 6);
    }
  }
});

test('品質補正が大きいほど高品質が出やすい', async () => {
  const data = await loadRealData();
  const avg = (bonus) => {
    const rng = createRng(11);
    let sum = 0;
    for (let i = 0; i < 3000; i++) sum += data.qualityIds().indexOf(rollQuality(data, rng, bonus));
    return sum / 3000;
  };
  assert.ok(avg(1) > avg(0) + 0.3);
});
