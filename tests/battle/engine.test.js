import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, advance, runToEnd, battleResult, aliveOf } from '../../src/battle/engine.js';
import { alliesFromParty } from '../../src/battle/setup.js';
import { EFFECTS } from '../../src/battle/effects.js';
import { STATUS_KINDS } from '../../src/battle/statusEffects.js';
import { PASSIVE_EFFECTS } from '../../src/battle/passives.js';
import { setLevel } from '../../src/progression/leveling.js';
import { moveSkill } from '../../src/progression/skillLoadout.js';
import { loadBattleData, loadRealData, actionsOf, damagesOf, newGameFixture } from '../helpers.js';

const tester = (over = {}) => ({ defId: 'chr_900', ...over });
const sandbag = (over = {}) => ({ defId: 'mon_900', ...over });

// ---------------------------------------------------------------- 基本の流れ

test('攻撃間隔2秒・「2の倍数」特技: 2秒通常、4秒特技、6秒通常、8秒特技', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: ['skill_001'] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 8000);
  assert.deepEqual(actionsOf(b, 'a1'), [
    [2000, 'normal', null],
    [4000, 'skill', 'skill_001'],
    [6000, 'normal', null],
    [8000, 'skill', 'skill_001'],
  ]);
  assert.equal(b.units[0].attackCount, 4);
});

test('1回行動するたびに、そのユニットのターンが1進む', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: [] })], enemies: [sandbag()] });
  advance(b, data, 6000);
  assert.equal(b.units[0].turnCount, 3);
  assert.deepEqual(b.log.filter((e) => e.actorId === 'a1').map((e) => e.turnCount), [1, 2, 3]);
});

test('攻撃行動ではターン数と攻撃回数がそれぞれ1進む', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: [] })], enemies: [sandbag()] });
  advance(b, data, 2000);
  assert.equal(b.units[0].turnCount, 1);
  assert.equal(b.units[0].attackCount, 1);
  assert.equal(b.log.find((e) => e.actorId === 'a1').countsAsAttack, true);
});

test('非攻撃行動ではターン数だけが進み、次の行動機会には通常攻撃できる', async () => {
  const data = await loadBattleData((raw) => {
    raw.skills.push({
      id: 'skill_903', name: '待機', countsAsAttack: false, mpCost: 0,
      trigger: { type: 'always' }, effects: [{ type: 'heal', target: 'self', power: 0 }],
    });
  });
  const b = createBattle(data, { allies: [tester({ skills: ['skill_903'] })], enemies: [sandbag()] });
  advance(b, data, 2000);
  assert.deepEqual([b.units[0].turnCount, b.units[0].attackCount], [1, 0]);
  advance(b, data, 2000);
  assert.deepEqual([b.units[0].turnCount, b.units[0].attackCount], [2, 1]);
  assert.deepEqual(actionsOf(b, 'a1').map((a) => a[1]), ['skill', 'normal']);
});

test('条件を満たす特技が複数あるときは優先順位の高いほうを1つだけ使う', async () => {
  const data = await loadBattleData();
  const run = (skills) => {
    const b = createBattle(data, { allies: [tester({ skills })], enemies: [sandbag()] });
    advance(b, data, 12000);
    return actionsOf(b, 'a1').map((a) => a[2]);
  };
  // 6回目は「2の倍数」「3の倍数」の両方を満たす
  assert.deepEqual(run(['skill_002', 'skill_001']), [null, 'skill_001', 'skill_002', 'skill_001', null, 'skill_002']);
  assert.deepEqual(run(['skill_001', 'skill_002']), [null, 'skill_001', 'skill_002', 'skill_001', null, 'skill_001']);
});

test('MPが足りない特技は飛ばして次の優先順位を確認する', async () => {
  const data = await loadBattleData();
  // skill_002: 3の倍数・MP12 / skill_001: 2の倍数・MP8。開始MP9
  const b = createBattle(data, { allies: [tester({ skills: ['skill_002', 'skill_001'], mp: 9 })], enemies: [sandbag()] });
  advance(b, data, 12000);
  const ev = b.log.filter((e) => e.type === 'action');
  // 1回目: 通常(+5)→14 / 2回目: skill_001(-8)→6 / 3回目: skill_002はMP不足→通常(+5)→11
  assert.equal(ev[2].kind, 'normal');
  assert.deepEqual(ev[2].skippedForMp, ['skill_002']);
  // 6回目: skill_002 はMP不足、次の skill_001 を使う
  assert.equal(ev[5].skillId, 'skill_001');
  assert.deepEqual(ev[5].skippedForMp, ['skill_002']);
});

test('使える特技がなければ通常攻撃し、最大MPの5%を回復する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: [], mp: 50 })], enemies: [sandbag()] });
  advance(b, data, 2000);
  assert.equal(b.units[0].mp, 55);
  const b2 = createBattle(data, { allies: [tester({ skills: [], mp: 98 })], enemies: [sandbag()] });
  advance(b2, data, 2000);
  assert.equal(b2.units[0].mp, 100, 'MPは最大を超えない');
});

test('特技を使うとMPを消費する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: ['skill_001'] })], enemies: [sandbag()] });
  advance(b, data, 4000);
  assert.equal(b.units[0].mp, 100 - 8);
});

test('敵はMPを必要としない', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ hp: 1000 })], enemies: [{ defId: 'mon_901' }] });
  advance(b, data, 2000);
  assert.deepEqual(actionsOf(b, 'e1'), [[1000, 'normal', null], [2000, 'skill', 'skill_001']]);
  assert.equal(b.units[1].mp, 0);
});

// ---------------------------------------------------------------- ダメージ

test('ダメージ計算: 攻撃力×威力×K/(K+防御)', async () => {
  const data = await loadBattleData((raw) => {
    raw.monsters.find((m) => m.id === 'mon_900').baseStats.def = 50;
  });
  const b = createBattle(data, { allies: [tester({ skills: ['skill_001'] })], enemies: [sandbag()] });
  advance(b, data, 4000);
  // K=50, 防御50 → 半減。通常100×0.5=50、強打160×0.5=80
  assert.deepEqual(damagesOf(b, 'a1'), [50, 80]);
});

test('属性倍率（弱点1.5倍）', async () => {
  const data = await loadBattleData((raw) => {
    raw.monsters.find((m) => m.id === 'mon_900').elementMultipliers = { elem_002: 1.5 };
  });
  const b = createBattle(data, { allies: [tester({ skills: ['skill_005'] })], enemies: [sandbag()] });
  advance(b, data, 4000);
  assert.deepEqual(damagesOf(b, 'a1'), [100, Math.round(100 * 1.3 * 1.5)]);
});

test('多段攻撃は回数ぶんダメージを与える', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: ['skill_002'] })], enemies: [sandbag()] });
  advance(b, data, 6000);
  const ev = b.log.filter((e) => e.type === 'action')[2];
  assert.deepEqual(ev.results.filter((r) => r.kind === 'damage').map((r) => r.amount), [70, 70, 70]);
});

// ---------------------------------------------------------------- 発動条件（戦闘中）

test('自分のHPが30%以下で「捨て身」', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: ['skill_007'], hp: 300 })], enemies: [sandbag()] });
  advance(b, data, 2000);
  assert.deepEqual(actionsOf(b, 'a1'), [[2000, 'skill', 'skill_007']]);
});

test('味方のHPが50%以下なら一番低い味方を回復する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, {
    allies: [tester({ skills: ['skill_003'] }), tester({ skills: [], hp: 400 })],
    enemies: [sandbag()],
  });
  advance(b, data, 2000);
  const heal = b.log.find((e) => e.actorId === 'a1').results.find((r) => r.kind === 'heal');
  assert.deepEqual(heal, { kind: 'heal', targetId: 'a2', amount: 150, source: 'skill' });
});

test('敵のHPが25%以下で「とどめ」', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: ['skill_010'] })], enemies: [sandbag({ hp: 20000 })] });
  advance(b, data, 2000);
  assert.equal(actionsOf(b, 'a1')[0][2], 'skill_010');
});

test('敵が毒状態のときだけ「追い打ち」', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: ['skill_006', 'skill_900'] })], enemies: [sandbag()] });
  advance(b, data, 4000);
  // 1回目: 毒を付与（追い打ちは条件未達）、2回目: 毒状態なので追い打ち
  assert.deepEqual(actionsOf(b, 'a1').map((a) => a[2]), ['skill_900', 'skill_006']);
});

// ---------------------------------------------------------------- 状態異常

test('2ターン状態異常は、対象ユニットが2回行動した後に終了する', async () => {
  const data = await loadBattleData((raw) => {
    raw.statuses.push({
      id: 'status_900', name: '2ターン効果', kind: 'statModifier', durationTurns: 2,
      turnTiming: 'actionEnd', params: { stat: 'atk', pct: -10 },
    });
    raw.skills.push({
      id: 'skill_904', name: '2ターン付与', mpCost: 0,
      trigger: { type: 'attackCountEvery', n: 1000, start: 1 },
      effects: [{ type: 'applyStatus', target: 'enemySingle', statusId: 'status_900' }],
    });
  });
  const b = createBattle(data, {
    allies: [tester({ skills: ['skill_904'], hp: 100000 })],
    enemies: [{ defId: 'mon_901', skills: [] }],
  });
  advance(b, data, 2000);
  assert.equal(b.units[1].turnCount, 2);
  assert.equal(b.units[1].statuses[0].remainingTurns, 1);
  advance(b, data, 1000);
  assert.equal(b.units[1].turnCount, 3);
  assert.equal(b.units[1].statuses.length, 0);
  assert.equal(b.log.find((e) => e.type === 'statusEnd' && e.statusId === 'status_900').t, 3000);
});

test('攻撃間隔が短いユニットほど同じ時間内に多くターンを消費する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, {
    allies: [tester({ skills: [], hp: 100000 })],
    enemies: [{ defId: 'mon_901', skills: [] }],
  });
  advance(b, data, 4000);
  assert.equal(b.units[0].turnCount, 2);
  assert.equal(b.units[1].turnCount, 4);
});

test('攻撃回数条件は非攻撃ターンを数えず、攻撃回数だけを参照する', async () => {
  const data = await loadBattleData((raw) => {
    raw.skills.push({
      id: 'skill_903', name: '待機', countsAsAttack: false, mpCost: 0,
      trigger: { type: 'always' }, effects: [{ type: 'heal', target: 'self', power: 0 }],
    });
  });
  const b = createBattle(data, { allies: [tester({ skills: ['skill_903', 'skill_001'] })], enemies: [sandbag()] });
  advance(b, data, 8000);
  assert.deepEqual(actionsOf(b, 'a1').map((a) => a[2]), ['skill_903', null, 'skill_903', 'skill_001']);
  assert.deepEqual([b.units[0].turnCount, b.units[0].attackCount], [4, 2]);
});

test('毒: 一定間隔で最大HPの4%ダメージ、時間で治る', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: ['skill_900'] })], enemies: [sandbag()] });
  advance(b, data, 14000);
  const ticks = b.log.filter((e) => e.type === 'statusTick');
  assert.deepEqual(ticks.map((e) => e.t), [4000, 6000, 8000, 10000, 12000]);
  assert.ok(ticks.every((e) => e.results[0].amount === 4000));
  const end = b.log.find((e) => e.type === 'statusEnd');
  assert.equal(end.t, 12000);
  assert.equal(b.units[1].statuses.length, 0);
});

test('麻痺: 効果中は攻撃間隔が1秒のびる', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, {
    allies: [tester({ skills: ['skill_901'], hp: 100000 })],
    enemies: [{ defId: 'mon_901', skills: [] }],
  });
  advance(b, data, 11000);
  // 敵は1秒間隔。2秒に麻痺（6秒間）→ 3, 5, 7秒。8秒で治り 9秒から元に戻る
  assert.deepEqual(actionsOf(b, 'e1').map((a) => a[0]), [1000, 3000, 5000, 7000, 9000, 10000, 11000]);
});

test('攻撃ダウン: 与えるダメージが下がる', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, {
    allies: [tester({ skills: ['skill_902'], hp: 100000 })],
    enemies: [{ defId: 'mon_901', skills: [] }],
  });
  advance(b, data, 3000);
  // 2秒は同時刻だが味方が先に動くので、敵の2回目の攻撃からもう下がっている
  assert.deepEqual(damagesOf(b, 'e1'), [10, 8, 8]);
});

// ---------------------------------------------------------------- 固有パッシブ

test('パッシブ: 攻撃するたびに攻撃力+2%（最大10回分）', async () => {
  const data = await loadBattleData((raw) => {
    raw.characters.find((c) => c.id === 'chr_900').passives = ['passive_001'];
  });
  const b = createBattle(data, { allies: [tester({ skills: [] })], enemies: [sandbag()] });
  advance(b, data, 24000);
  const d = damagesOf(b, 'a1');
  assert.deepEqual(d.slice(0, 3), [102, 104, 106]);
  assert.equal(d[11], 120);
});

test('パッシブ: 通常攻撃のMP回復量が増える', async () => {
  const data = await loadBattleData((raw) => {
    raw.characters.find((c) => c.id === 'chr_900').passives = ['passive_002'];
  });
  const b = createBattle(data, { allies: [tester({ skills: [], mp: 50 })], enemies: [sandbag()] });
  advance(b, data, 2000);
  assert.equal(b.units[0].mp, 58);
});

test('パッシブ: 4回攻撃するごとにHP回復', async () => {
  const data = await loadBattleData((raw) => {
    raw.characters.find((c) => c.id === 'chr_900').passives = ['passive_003'];
  });
  const b = createBattle(data, { allies: [tester({ skills: [], hp: 500 })], enemies: [sandbag()] });
  advance(b, data, 8000);
  assert.equal(b.units[0].hp, 550);
});

test('パッシブ: 毒状態の敵へのダメージ+30%', async () => {
  const data = await loadBattleData((raw) => {
    raw.characters.find((c) => c.id === 'chr_900').passives = ['passive_004'];
  });
  const b = createBattle(data, { allies: [tester({ skills: ['skill_900'] })], enemies: [sandbag()] });
  advance(b, data, 4000);
  assert.deepEqual(damagesOf(b, 'a1'), [0, 130]);
});

// ---------------------------------------------------------------- 決着

test('敵を全員倒すと勝利し、それ以上進まない', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: [] })], enemies: [sandbag({ hp: 250 })] });
  advance(b, data, 60000);
  assert.equal(b.outcome, 'won');
  assert.equal(b.timeMs, 6000);
  assert.equal(advance(b, data, 10000), 0);
  assert.equal(b.log.at(-1).type, 'end');
});

test('味方が全員倒れると敗北', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [tester({ skills: [], hp: 15 })], enemies: [{ defId: 'mon_901', skills: [] }] });
  runToEnd(b, data);
  assert.equal(b.outcome, 'lost');
  assert.equal(b.timeMs, 2000);
});

test('制限時間を過ぎると時間切れ', async () => {
  const data = await loadBattleData((raw) => {
    raw.monsters.find((m) => m.id === 'mon_900').baseStats.hp = 1e9;
  });
  const b = createBattle(data, { allies: [tester({ skills: [] })], enemies: [sandbag()] });
  runToEnd(b, data);
  assert.equal(b.outcome, 'timeout');
  assert.equal(b.timeMs, data.balance.battle.timeLimitMs);
});

test('倒れたユニットは行動しない。味方は先頭の敵から狙う', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, {
    allies: [tester({ skills: [] })],
    enemies: [sandbag({ hp: 150 }), sandbag({ hp: 150 })],
  });
  runToEnd(b, data);
  const targets = b.log.filter((e) => e.actorId === 'a1').map((e) => e.results[0].targetId);
  assert.deepEqual(targets, ['e1', 'e1', 'e2', 'e2']);
  assert.equal(b.units[1].name, 'サンドバッグ A');
  assert.equal(b.units[2].name, 'サンドバッグ B');
});

test('フィールド戦闘後はMP全回復、連戦ダンジョンでは持ち越す', async () => {
  const data = await loadBattleData();
  const spec = { allies: [tester({ skills: ['skill_001'] })], enemies: [sandbag({ hp: 300 })] };
  const field = createBattle(data, { ...spec, mode: 'field' });
  runToEnd(field, data);
  assert.equal(battleResult(field).allies[0].mp, 100);
  const dungeon = createBattle(data, { ...spec, mode: 'dungeon' });
  runToEnd(dungeon, data);
  assert.equal(battleResult(dungeon).allies[0].mp, dungeon.units[0].mp);
  assert.ok(battleResult(dungeon).allies[0].mp < 100);
});

// ---------------------------------------------------------------- 再現性

test('seedが同じなら結果は同じ。進め方（速度）で結果は変わらない', async () => {
  const data = await loadRealData();
  const { save } = await newGameFixture();
  const spec = () => ({
    allies: alliesFromParty(save, data),
    enemies: [{ defId: 'mon_003', level: 4 }, { defId: 'mon_002', level: 4 }, { defId: 'mon_004', level: 3 }],
    seed: 123,
  });
  const a = createBattle(data, spec());
  while (!a.outcome) advance(a, data, 16); // ×1 の画面（60fps）相当
  const b = createBattle(data, spec());
  while (!b.outcome) advance(b, data, 48); // ×3 相当
  const c = runToEnd(createBattle(data, spec()), data);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.log, c.log);
  const d = runToEnd(createBattle(data, { ...spec(), seed: 999 }), data);
  assert.notDeepEqual(a.log, d.log);
});

test('編成画面の優先順位がそのまま戦闘に使われる', async () => {
  const { data, save } = await newGameFixture();
  setLevel(save, data, 'chr_001', 20);
  moveSkill(save, 'chr_001', 3, 0);
  assert.deepEqual(alliesFromParty(save, data)[0].skills, ['skill_007', 'skill_001', 'skill_002', 'skill_014', 'skill_011']);
});

// ---------------------------------------------------------------- データとの整合

test('データで使われている効果・状態異常・パッシブはすべて処理が登録されている', async () => {
  const data = await loadRealData();
  for (const s of data.list('skills')) {
    for (const e of [...s.effects, ...(s.completionEffects ?? [])]) assert.ok(EFFECTS[e.type]?.apply, e.type);
  }
  for (const s of data.list('statuses')) assert.ok(STATUS_KINDS[s.kind], s.kind);
  for (const p of data.list('passives')) {
    for (const e of p.effects) {
      const def = PASSIVE_EFFECTS[e.type];
      const hasHook = def.static || def.onAttackStart || def.statPct || def.damagePct || def.normalAttackMpPct || def.afterAction || def.afterNormalAttackHit || def.afterAttackHit || def.onMarkerIncreased || def.onMarkerConsumed;
      assert.ok(hasHook, `${e.type} に処理がない`);
    }
  }
});

test('実データの全モンスター同士で戦闘が最後まで進む', async () => {
  const data = await loadRealData();
  const mons = data.list('monsters').map((m) => m.id);
  let seed = 1;
  for (const a of mons) {
    for (const e of mons) {
      const b = runToEnd(createBattle(data, { allies: [{ defId: a, level: 10 }], enemies: [{ defId: e, level: 10 }], seed: seed++ }), data);
      assert.ok(['won', 'lost', 'timeout'].includes(b.outcome));
      assert.ok(aliveOf(b, 'ally').length === 0 || aliveOf(b, 'enemy').length === 0 || b.outcome === 'timeout');
    }
  }
});
