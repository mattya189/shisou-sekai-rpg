import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleReport, effectPresentation, presentationCues, skillPresentation } from '../../src/ui/battlePresentation.js';
import { shouldPlayCue, soundSpecForCue } from '../../src/ui/battleAudio.js';
import { advance, battleResult, createBattle, runToEnd } from '../../src/battle/engine.js';
import { loadBattleData } from '../helpers.js';

test('戦闘画面モジュールを読み込める', async () => {
  const screen = await import('../../src/ui/screens/battle.js');
  assert.equal(typeof screen.default.render, 'function');
});

test('4体の味方を個別集計し、行動結果から戦績を作る', () => {
  const units = [1, 2, 3, 4].map((n) => ({ id: `a${n}`, name: `味方${n}`, side: 'ally' }));
  units.push({ id: 'e1', name: '敵', side: 'enemy' });
  const battle = {
    units,
    log: [
      { type: 'action', actorId: 'a1', kind: 'normal', skillId: null, results: [{ kind: 'damage', targetId: 'e1', amount: 20 }] },
      { type: 'action', actorId: 'e1', kind: 'normal', skillId: null, results: [{ kind: 'damage', targetId: 'a2', amount: 7 }] },
      { type: 'action', actorId: 'a3', kind: 'skill', skillId: 'skill_x', results: [{ kind: 'heal', targetId: 'a2', amount: 5 }] },
      { type: 'statusTick', targetId: 'a4', results: [{ kind: 'damage', targetId: 'a4', amount: 3 }] },
    ],
  };
  assert.deepEqual(buildBattleReport(battle), [
    { unitId: 'a1', name: '味方1', damageDealt: 20, damageTaken: 0, healing: 0, normalAttacks: 1, skillUses: 0, comboTriggers: 0, markerGain: 0 },
    { unitId: 'a2', name: '味方2', damageDealt: 0, damageTaken: 7, healing: 0, normalAttacks: 0, skillUses: 0, comboTriggers: 0, markerGain: 0 },
    { unitId: 'a3', name: '味方3', damageDealt: 0, damageTaken: 0, healing: 5, normalAttacks: 0, skillUses: 1, comboTriggers: 0, markerGain: 0 },
    { unitId: 'a4', name: '味方4', damageDealt: 0, damageTaken: 3, healing: 0, normalAttacks: 0, skillUses: 0, comboTriggers: 0, markerGain: 0 },
  ]);
});

test('非攻撃特技の表示イベントは攻撃回数を増やしたように扱わない', async () => {
  const data = await loadBattleData();
  const event = { type: 'action', actorId: 'a1', kind: 'skill', skillId: 'skill_003', countsAsAttack: false, attackCount: 4, results: [{ kind: 'heal', targetId: 'a1', amount: 10 }] };
  const cues = presentationCues(event, { units: [] }, data);
  assert.equal(cues[0].countsAsAttack, false);
  assert.equal(cues[0].attackCount, 4);
  assert.deepEqual(cues.filter((c) => c.type === 'heal').map((c) => c.amount), [10]);
});

test('1行動内の複数対象・スタック変化・連携をすべて表示イベントへ変換する', async () => {
  const data = await loadBattleData();
  const event = {
    type: 'action', actorId: 'a1', kind: 'skill', skillId: 'skill_002', countsAsAttack: true, attackCount: 3,
    results: [
      { kind: 'damage', targetId: 'e1', amount: 11 },
      { kind: 'damage', targetId: 'e2', amount: 12 },
      { kind: 'markerChanged', targetId: 'e1', markerId: 'marker_001', amount: 2, value: 2 },
      { kind: 'attackCountChanged', targetId: 'a1', amount: 1, value: 4 },
      { kind: 'attackComboTriggered', targetId: 'a1', comboSkillId: 'skill_002' },
    ],
  };
  const cues = presentationCues(event, { units: [] }, data);
  assert.deepEqual(cues.filter((c) => c.type === 'damage').map((c) => [c.targetId, c.amount]), [['e1', 11], ['e2', 12]]);
  assert.equal(cues.find((c) => c.type === 'marker').amount, 2);
  assert.deepEqual(cues.find((c) => c.type === 'attackCount'), { type: 'attackCount', targetId: 'a1', amount: 1, value: 4 });
  assert.equal(cues.filter((c) => c.type === 'combo').length, 1);
});

test('確定ダメージに使われた属性IDをパーティクルと効果音へ引き継ぐ', async () => {
  const data = await loadBattleData();
  const event = {
    type: 'action', actorId: 'a1', kind: 'skill', skillId: 'skill_002', countsAsAttack: true, attackCount: 1,
    results: [{ kind: 'damage', targetId: 'e1', amount: 20, element: 'elem_005' }],
  };
  const cue = presentationCues(event, { units: [] }, data).find((entry) => entry.type === 'damage');
  assert.equal(cue.elementId, 'elem_005');
  assert.equal(effectPresentation(cue, data).particle, 'ice');
  assert.equal(soundSpecForCue(cue, data).from, 980);
});

test('属性ごとの演出定義をデータから使い、未知属性は無属性へフォールバックする', async () => {
  const data = await loadBattleData();
  assert.equal(effectPresentation({ type: 'damage', elementId: 'elem_002' }, data).particle, 'fire');
  assert.equal(effectPresentation({ type: 'damage', elementId: 'elem_003' }, data).particle, 'water');
  assert.equal(effectPresentation({ type: 'damage', elementId: 'elem_004' }, data).particle, 'wind');
  assert.equal(effectPresentation({ type: 'damage', elementId: 'elem_006' }, data).particle, 'nature');
  assert.equal(effectPresentation({ type: 'damage', elementId: 'elem_007' }, data).particle, 'light');
  assert.equal(effectPresentation({ type: 'damage', elementId: 'elem_008' }, data).particle, 'lightning');
  assert.equal(effectPresentation({ type: 'damage', elementId: 'elem_009' }, data).particle, 'dark');
  assert.equal(effectPresentation({ type: 'damage', elementId: 'unknown' }, data).particle, 'neutral');
});

test('4倍速では通常ヒットだけ決定的に間引き、奥義・BREAK・戦闘結果は残す', () => {
  assert.equal(shouldPlayCue({ type: 'damage', tier: 'normal' }, 4, 1), false);
  assert.equal(shouldPlayCue({ type: 'damage', tier: 'normal' }, 4, 3), true);
  assert.equal(shouldPlayCue({ type: 'damage', tier: 'ultimate' }, 4, 1), true);
  assert.equal(shouldPlayCue({ type: 'break' }, 4, 1), true);
  assert.equal(shouldPlayCue({ type: 'outcome', outcome: 'won' }, 4, 1), true);
});

test('通常・特技・連携・奥義の演出強度をデータとイベントから決める', () => {
  assert.equal(skillPresentation(null, { kind: 'normal', results: [] }).tier, 'normal');
  assert.equal(skillPresentation({ name: '技', effects: [] }, { kind: 'skill', results: [] }).tier, 'skill');
  assert.equal(skillPresentation({ name: '連携', comboFrom: 'skill_x', effects: [] }, { kind: 'skill', results: [] }).tier, 'combo');
  assert.equal(skillPresentation({ name: '奥義：試験', effects: [] }, { kind: 'skill', results: [] }).tier, 'ultimate');
  assert.equal(skillPresentation({ name: '指定', presentation: { tier: 'combo', type: 'projectile' }, effects: [] }, { kind: 'skill', results: [] }).type, 'projectile');
});

test('表示速度に相当するadvance刻みが違っても同一seedの結果は変わらない', async () => {
  const data = await loadBattleData();
  const opts = { allies: [{ defId: 'chr_900', skills: ['skill_001'] }], enemies: [{ defId: 'mon_901' }], seed: 31415 };
  const fast = createBattle(data, opts);
  const normal = createBattle(data, opts);
  while (!fast.outcome) advance(fast, data, 64);
  while (!normal.outcome) advance(normal, data, 16);
  assert.deepEqual(battleResult(fast), battleResult(normal));
  assert.deepEqual(fast.log, normal.log);
});

test('実戦ログの戦績集計はログや戦闘結果を変更しない', async () => {
  const data = await loadBattleData();
  const battle = createBattle(data, { allies: [{ defId: 'chr_900', skills: ['skill_001'] }], enemies: [{ defId: 'mon_900' }], seed: 9 });
  runToEnd(battle, data);
  const before = structuredClone(battle.log);
  const report = buildBattleReport(battle);
  assert.equal(report.length, 1);
  assert.ok(report[0].damageDealt > 0);
  assert.deepEqual(battle.log, before);
});
