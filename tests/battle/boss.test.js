import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import { createBattle, advance, runToEnd } from '../../src/battle/engine.js';
import { applyBattleOutcome } from '../../src/game/battleOutcome.js';
import { loadBattleData, actionsOf, newGameFixture } from '../helpers.js';

/** テスト用のボス: 本体HP大、攻撃しないテスト役に囲まれて観察する */
async function bossData(modifyBoss = () => {}) {
  return loadBattleData((raw) => {
    const boss = raw.bosses.find((b) => b.id === 'boss_001');
    boss.statMultiplier = { hp: 100 };
    modifyBoss(boss, raw);
  });
}
const idle = { defId: 'chr_900', skills: [], hp: 100000 };

test('部位は本体の前に並び、味方は部位から狙う。部位を倒さなくても本体を倒せば勝ち', async () => {
  const data = await loadBattleData((raw) => {
    const boss = raw.bosses.find((b) => b.id === 'boss_001');
    boss.statMultiplier = { hp: 1 };
    boss.parts[0].hpPct = 1000;
  });
  const b = createBattle(data, { allies: [{ defId: 'chr_900', skills: ['skill_013'], hp: 100000 }], enemies: [{ bossId: 'boss_001' }] });
  assert.equal(b.units[1].isPart, true);
  assert.equal(b.units[2].boss.id, 'boss_001');
  runToEnd(b, data);
  // 全体攻撃で本体が先に倒れる
  assert.equal(b.outcome, 'won');
  assert.equal(b.units[1].alive, true);
});

test('大技予兆: 決まった回数ごとに力をため、ため終わると大技を放つ', async () => {
  const data = await bossData((boss) => {
    boss.parts = [];
    boss.breakGauge = undefined;
  });
  const b = createBattle(data, { allies: [idle], enemies: [{ bossId: 'boss_001' }] });
  advance(b, data, 20000);
  const charge = b.log.find((e) => e.type === 'chargeStart');
  const iv = b.units[1].stats.attackIntervalMs;
  assert.equal(charge.t, iv * 4);
  const fired = b.log.find((e) => e.type === 'action' && e.actorId === 'e1' && e.charged);
  assert.equal(fired.t, iv * 4 + 3000);
  assert.equal(fired.skillId, 'skill_013');
});

test('敵が大技準備中なら「身構える」が発動する', async () => {
  const data = await bossData((boss) => {
    boss.parts = [];
    boss.breakGauge = undefined;
  });
  const b = createBattle(data, { allies: [{ ...idle, skills: ['skill_012'] }], enemies: [{ bossId: 'boss_001' }] });
  advance(b, data, 20000);
  const guard = b.log.find((e) => e.type === 'action' && e.skillId === 'skill_012');
  const charge = b.log.find((e) => e.type === 'chargeStart');
  assert.ok(guard && guard.t > charge.t);
});

test('BREAK: ゲージが0で行動不能・被ダメージ増加、大技の準備も中断。時間で回復', async () => {
  const data = await bossData((boss) => {
    boss.parts = [];
    boss.breakGauge = { max: 3, durationMs: 5000, damageTakenPct: 50 };
  });
  const b = createBattle(data, { allies: [{ defId: 'chr_900', skills: [] }], enemies: [{ bossId: 'boss_001' }] });
  advance(b, data, 6000); // 2, 4, 6秒の通常攻撃でゲージ3を削り切る
  const brk = b.log.find((e) => e.type === 'action' && e.results.some((r) => r.kind === 'break'));
  assert.equal(brk.t, 6000);
  assert.equal(b.units[1].broken, true);
  advance(b, data, 2000);
  const dmg = b.log.filter((e) => e.actorId === 'a1').map((e) => e.results.find((r) => r.kind === 'damage').amount);
  assert.ok(dmg[3] > dmg[0] * 1.4, 'BREAK中は被ダメージが増える');
  assert.ok(!b.log.some((e) => e.actorId === 'e1' && e.t > 6000 && e.t < 11000), 'BREAK中は行動しない');
  advance(b, data, 4000);
  assert.ok(b.log.some((e) => e.type === 'breakEnd' && e.t === 11000));
  assert.equal(b.units[1].broken, false);
});

test('BREAK中の敵には「隙を突く」が発動する', async () => {
  const data = await bossData((boss) => {
    boss.parts = [];
    boss.breakGauge = { max: 1, durationMs: 5000, damageTakenPct: 0 };
  });
  const b = createBattle(data, { allies: [{ defId: 'chr_900', skills: ['skill_011'] }], enemies: [{ bossId: 'boss_001' }] });
  advance(b, data, 4000);
  assert.deepEqual(actionsOf(b, 'a1').map((a) => a[2]), [null, 'skill_011']);
});

test('HPが減るとフェーズが変わり、特技と能力が変わる', async () => {
  const data = await loadBattleData((raw) => {
    const boss = raw.bosses.find((b) => b.id === 'boss_001');
    boss.parts = [];
    boss.breakGauge = undefined;
  });
  const b = createBattle(data, { allies: [idle], enemies: [{ bossId: 'boss_001', hp: 100000 }] });
  const boss = b.units[1];
  boss.hp = Math.floor(boss.maxHp * 0.51);
  b.units[0].skills = [];
  b.units[0].stats.atk = 100;
  advance(b, data, 2000);
  const ev = b.log.find((e) => e.type === 'action' && e.results.some((r) => r.kind === 'phase'));
  assert.ok(ev);
  assert.deepEqual(boss.skills, ['skill_004', 'skill_008', 'skill_001']);
  assert.equal(boss.buffs.atk, 20);
});

test('部位破壊で本体の特技が封じられ、能力が下がる', async () => {
  const data = await bossData((boss) => {
    boss.breakGauge = undefined;
    boss.parts[0].hpPct = 0.0001;
  });
  const b = createBattle(data, { allies: [{ defId: 'chr_900', skills: [] }], enemies: [{ bossId: 'boss_001' }] });
  advance(b, data, 2000);
  const boss = b.units[2];
  assert.equal(boss.boss.partsDestroyed, 1);
  assert.ok(!boss.skills.includes('skill_008'));
  assert.equal(boss.buffs.atk, -20);
});

test('時間経過ギミック: 決まった時間に能力が上がる', async () => {
  const data = await bossData((boss) => {
    boss.parts = [];
    boss.gimmicks = [{ atMs: 5000, statPct: { atk: 50 }, message: 'test' }];
  });
  const b = createBattle(data, { allies: [idle], enemies: [{ bossId: 'boss_001' }] });
  advance(b, data, 6000);
  assert.ok(b.log.some((e) => e.type === 'gimmick' && e.t === 5000));
  assert.equal(b.units[1].buffs.atk, 50);
});

test('状態異常への耐性（麻痺無効）', async () => {
  const data = await bossData((boss) => {
    boss.parts = [];
  });
  const b = createBattle(data, { allies: [{ defId: 'chr_900', skills: ['skill_901'] }], enemies: [{ bossId: 'boss_001' }] });
  advance(b, data, 2000);
  const r = b.log.find((e) => e.actorId === 'a1').results[0];
  assert.equal(r.kind, 'statusResisted');
  assert.equal(r.immune, true);
});

test('ボスは条件（BREAK・部位破壊）を満たして倒すと仲間になる', async () => {
  const { data, save } = await newGameFixture();
  const make = (breakMax) => {
    const b = createBattle(data, {
      allies: [{ unitId: 'chr_001', defId: 'chr_900' }].map(() => ({ unitId: 'chr_001', defId: 'chr_001', level: 60, skills: ['skill_014'] })),
      enemies: [{ bossId: 'boss_001' }],
      seed: 5,
    });
    b.units.find((u) => u.boss).boss.break.gauge = breakMax;
    return runToEnd(b, data);
  };
  const b = make(1);
  assert.equal(b.outcome, 'won');
  const s = applyBattleOutcome(save, data, b, createRng(1));
  const rec = s.recruits.find((r) => r.boss);
  assert.equal(rec.success, true);
  assert.ok(save.units.mon_006);
  assert.equal(save.flags.flag_004, true);
  assert.ok(s.drops.some((d) => d.itemId === 'item_007' && d.qty === 3));
});

test('条件を満たさずに倒すとボスは仲間にならず、ヒントが出る', async () => {
  const { data, save } = await newGameFixture();
  const b = createBattle(data, { allies: [{ unitId: 'chr_001', defId: 'chr_001', level: 90, skills: ['skill_013'] }], enemies: [{ bossId: 'boss_001' }], seed: 5 });
  runToEnd(b, data);
  assert.equal(b.outcome, 'won');
  const s = applyBattleOutcome(save, data, b, createRng(1));
  const rec = s.recruits.find((r) => r.boss);
  assert.equal(rec.success, false);
  assert.ok(rec.hint);
  assert.equal(save.units.mon_006, undefined);
});

test('部位は撃破数・図鑑・経験値の対象にならない', async () => {
  const { data, save } = await newGameFixture();
  const b = createBattle(data, { allies: [{ unitId: 'chr_001', defId: 'chr_001', level: 90, skills: [] }], enemies: [{ bossId: 'boss_001' }], seed: 2 });
  runToEnd(b, data);
  applyBattleOutcome(save, data, b, createRng(1));
  assert.equal(save.codex.monsters.mon_006.counts.defeated, 1);
});
