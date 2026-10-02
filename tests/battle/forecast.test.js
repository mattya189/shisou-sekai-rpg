import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, advance, nextEventTime, runToEnd, battleResult } from '../../src/battle/engine.js';
import { skillForecast, nextAttackCountFor, splitAttackCountCondition, involvesAttackCount } from '../../src/battle/forecast.js';
import { loadBattleData } from '../helpers.js';

const someime = (over = {}) => ({ defId: 'mon_007', level: 40, rank: 5, usesMp: false, ...over });
const sandbag = (over = {}) => ({ defId: 'mon_900', ...over });
const byId = (items) => Object.fromEntries(items.map((i) => [i.skillId, i]));

test('攻撃回数12のとき、侵色弾(3の倍数)もインク飛ばし(5の倍数)も次は15回目', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_015', 'skill_016'] })], enemies: [sandbag()], seed: 1 });
  b.units[0].attackCount = 12;
  const f = byId(skillForecast(b.units[0], b, data));
  assert.equal(f.skill_015.nextAttackCount, 15);
  assert.equal(f.skill_016.nextAttackCount, 15);
  // 同じ回数に到達するので、優先度の低いインク飛ばしには理由が付く
  assert.ok(f.skill_016.blockers.some((x) => x.code === 'priority' && x.skillId === 'skill_015'));
  assert.ok(!f.skill_015.blockers.some((x) => x.code === 'priority'));
});

test('攻撃特技は「今回成立する攻撃回数」から数える（現在が倍数でも次の倍数）', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_015'] })], enemies: [sandbag()], seed: 1 });
  b.units[0].attackCount = 2;
  assert.equal(skillForecast(b.units[0], b, data)[0].nextAttackCount, 3);
  b.units[0].attackCount = 3;
  assert.equal(skillForecast(b.units[0], b, data)[0].nextAttackCount, 6);
});

test('確率特技・非攻撃回数の条件には「次○回目」を付けない', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_019', 'skill_018', 'skill_017'] })], enemies: [sandbag()], seed: 1 });
  const f = byId(skillForecast(b.units[0], b, data));
  assert.equal(f.skill_019.category, 'chance');
  assert.equal(f.skill_019.chance, 0.1);
  assert.equal(f.skill_019.nextAttackCount, null);
  assert.equal(f.skill_018.category, 'condition');
  assert.equal(f.skill_018.nextAttackCount, null);
  assert.equal(f.skill_017.category, 'condition');
  assert.equal(f.skill_017.otherConditionsMet, false); // 敵の侵色0 < 100
});

test('奥義は複合条件を分けて扱い、使用済み・MP不足を理由に出す', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ skills: ['skill_023'], usesMp: true, mp: 5 })], enemies: [sandbag()], seed: 1 });
  const unit = b.units[0];
  unit.attackCount = 3;
  let f = skillForecast(unit, b, data)[0];
  assert.equal(f.category, 'attackCount');
  assert.equal(f.nextAttackCount, 4);
  assert.equal(f.otherConditions.length, 1);
  assert.equal(f.otherConditionsMet, false);
  assert.deepEqual(f.blockers.map((x) => x.code).sort(), ['mp', 'otherCondition']);
  unit.mp = unit.maxMp;
  b.units[1].markers.marker_001 = { stacks: 30, reachedMaxAt: null };
  unit.usedSkills.push('skill_023');
  f = skillForecast(unit, b, data)[0];
  assert.equal(f.otherConditionsMet, true);
  assert.deepEqual(f.blockers.map((x) => x.code), ['used']);
});

test('予測は戦闘状態を変えない（乱数も消費しない）', async () => {
  const data = await loadBattleData();
  const make = () => createBattle(data, { allies: [someime()], enemies: [sandbag()], seed: 7 });
  const plain = make();
  advance(plain, data, 30_000);
  const probed = make();
  for (let t = 0; t < 30_000; t += 250) {
    skillForecast(probed.units[0], probed, data);
    advance(probed, data, 250);
  }
  assert.deepEqual(probed.log, plain.log);
});

test('エンジンと一致: 攻撃回数特技は、直前の予測どおりの攻撃回数で発動する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime({ usesMp: false })], enemies: [sandbag()], seed: 3 });
  let last = byId(skillForecast(b.units[0], b, data));
  let seen = b.log.length;
  let checked = 0;
  while (!b.outcome && b.timeMs < 120_000) {
    const t = nextEventTime(b);
    advance(b, data, t - b.timeMs);
    for (const ev of b.log.slice(seen)) {
      if (ev.type !== 'action' || ev.actorId !== 'a1' || ev.kind !== 'skill') continue;
      const pred = last[ev.skillId];
      if (pred?.category !== 'attackCount' || !pred.countsAsAttack) continue;
      assert.equal(ev.attackCount, pred.nextAttackCount, `${ev.skillId} @${ev.t}`);
      checked += 1;
    }
    seen = b.log.length;
    last = byId(skillForecast(b.units[0], b, data));
  }
  assert.ok(checked >= 5, `検証した発動数 ${checked}`);
});

test('nextEventTime で1出来事ずつ進めても、まとめて進めた場合と結果が同じ', async () => {
  const data = await loadBattleData();
  const make = () => createBattle(data, { allies: [someime(), { defId: 'chr_900' }], enemies: [{ defId: 'mon_901' }, sandbag()], seed: 11 });
  const whole = runToEnd(make(), data);
  const stepped = make();
  while (!stepped.outcome) {
    const t = nextEventTime(stepped);
    if (t == null || t >= data.balance.battle.timeLimitMs) advance(stepped, data, data.balance.battle.timeLimitMs);
    else advance(stepped, data, t - stepped.timeMs);
  }
  assert.deepEqual(stepped.log, whole.log);
  assert.deepEqual(battleResult(stepped), battleResult(whole));
});

test('攻撃回数条件の分解と探索', () => {
  const mixed = { type: 'all', of: [{ type: 'enemyBreak' }, { type: 'attackCountMultiple', n: 2 }] };
  const { countPart, otherParts } = splitAttackCountCondition(mixed);
  assert.deepEqual(countPart, { type: 'attackCountMultiple', n: 2 });
  assert.deepEqual(otherParts, [{ type: 'enemyBreak' }]);
  assert.equal(nextAttackCountFor({ type: 'attackCountEvery', n: 4, start: 2 }, 3), 6);
  assert.equal(involvesAttackCount(mixed), true);
  assert.equal(involvesAttackCount({ type: 'randomChance', chance: 0.1 }), false);
  // any に攻撃回数以外が混ざると到達回数は予測しない
  assert.equal(splitAttackCountCondition({ type: 'any', of: [{ type: 'enemyBreak' }, { type: 'attackCountMultiple', n: 2 }] }).countPart, null);
});
