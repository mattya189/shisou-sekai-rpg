import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, advance } from '../../src/battle/engine.js';
import { unitDetailModel, statusPolarity, statusRemainingText, compactBadges, fieldStatusArea, logEventMeta } from '../../src/ui/battleDetail.js';
import { slotLayout } from '../../src/ui/battleLayout.js';
import { presentationCues } from '../../src/ui/battlePresentation.js';
import { loadBattleData } from '../helpers.js';

const someime = (over = {}) => ({ defId: 'mon_007', level: 40, rank: 5, usesMp: false, ...over });
const sandbag = (over = {}) => ({ defId: 'mon_900', ...over });

test('ターン基準の残り期間は対象自身の行動で減ると明示する', () => {
  const t = statusRemainingText({ remainingTurns: 2, turnTiming: 'actionEnd' }, 0);
  assert.equal(t.short, '2行動');
  assert.match(t.long, /このキャラが2回行動すると終了/);
  const s = statusRemainingText({ expiresAt: 4500, remainingTurns: null }, 1000);
  assert.match(s.long, /3\.5秒/);
});

test('状態の有利・不利をデータから判定する', () => {
  assert.equal(statusPolarity({ kind: 'damageOverTime' }), 'debuff');
  assert.equal(statusPolarity({ kind: 'statModifier', params: { pct: 50 } }), 'buff');
  assert.equal(statusPolarity({ kind: 'statModifier', params: { pct: -20 } }), 'debuff');
  assert.equal(statusPolarity({ kind: 'intervalPctModifier', params: { pct: 5 } }), 'debuff');
  assert.equal(statusPolarity({ kind: 'multiStatModifier', params: { statPct: { atk: 5 }, intervalPct: -5 } }), 'buff');
});

test('詳細は行動回数と攻撃回数を別に持ち、戦闘状態の値をそのまま出す', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime()], enemies: [sandbag()], seed: 1 });
  advance(b, data, 20_000);
  const u = b.units[0];
  const m = unitDetailModel(u, b, data);
  assert.equal(m.turnCount, u.turnCount);
  assert.equal(m.attackCount, u.attackCount);
  assert.equal(m.hp, u.hp);
  assert.equal(m.rank, 5);
  assert.equal(m.mp, null); // usesMp=false のユニットにMPを作らない
  const enemy = unitDetailModel(b.units[1], b, data);
  assert.equal(enemy.sideLabel, '敵');
  assert.equal(enemy.rank, null);
  assert.ok(enemy.markers.some((mk) => mk.name === '侵色' && mk.max === 100));
  const ink = m.skills.find((s) => s.id === 'skill_015');
  assert.match(ink.forecast, /攻撃\d+回目/);
});

test('詳細を作っても戦闘は進まない・変わらない', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [someime()], enemies: [sandbag()], seed: 2 });
  advance(b, data, 8000);
  const snapshot = JSON.stringify(b.log) + b.timeMs;
  for (const u of b.units) unitDetailModel(u, b, data);
  assert.equal(JSON.stringify(b.log) + b.timeMs, snapshot);
});

test('通常画面の状態表示は代表2件＋件数にまとめる', () => {
  const data = { find: (cat, id) => ({ markers: { m1: { name: '侵色', maxStacks: 100 } }, statuses: { s1: { name: '毒', kind: 'damageOverTime' }, s2: { name: '守り', kind: 'statModifier', params: { pct: 10 } } } })[cat]?.[id] ?? null };
  const unit = { markers: { m1: { stacks: 30 } }, statuses: [{ statusId: 's2', remainingTurns: 2 }, { statusId: 's1', expiresAt: 5000 }] };
  const { visible, hiddenCount } = compactBadges(unit, data, 2);
  assert.deepEqual(visible.map((v) => v.label), ['侵色', '毒']);
  assert.equal(hiddenCount, 1);
});

test('各陣営は横一直線に並ぶ（3体は左・中央・右）', () => {
  const l = slotLayout([{}, {}, {}]);
  assert.deepEqual(l.map((s) => s.x), [18, 50, 82]);
  assert.ok(l.every((s) => s.depth === l[0].depth));
  assert.deepEqual(slotLayout([{}]).map((s) => s.x), [50]);
  const boss = slotLayout([{ isPart: true }, { boss: {} }]);
  assert.equal(boss[1].x, 50);
  assert.equal(boss[1].depth, 0);
});

test('攻撃回数条件の特技は「攻撃○回目」を技名の前に出す', async () => {
  const data = await loadBattleData();
  const event = { type: 'action', actorId: 'a1', kind: 'skill', skillId: 'skill_015', countsAsAttack: true, attackCount: 3, charged: false, results: [{ kind: 'damage', targetId: 'e1', amount: 10 }] };
  const types = presentationCues(event, { units: [] }, data).map((c) => c.type);
  assert.ok(types.indexOf('countTrigger') >= 0 && types.indexOf('countTrigger') < types.indexOf('banner'));
  const cue = presentationCues(event, { units: [] }, data).find((c) => c.type === 'countTrigger');
  assert.equal(cue.label, '攻撃3回目');
  assert.deepEqual(presentationCues(event, { units: [] }, data)[0].targetIds, ['e1']);
  // 確率特技には付けない
  const chance = { ...event, skillId: 'skill_019', countsAsAttack: false };
  assert.ok(!presentationCues(chance, { units: [] }, data).some((c) => c.type === 'countTrigger'));
});

test('ログ補足は行動回数と攻撃回数を分けて書く', () => {
  assert.equal(logEventMeta({ type: 'action', kind: 'skill', turnCount: 7, attackCount: 5, countsAsAttack: false }), '7行動目・攻撃回数5のまま');
  assert.equal(logEventMeta({ type: 'action', kind: 'normal', turnCount: 8, attackCount: 6, countsAsAttack: true }), '8行動目・攻撃6回目');
});

test('戦場のスタック欄は1件ずつ名前・値・上限・蓄積率を出し、超過分は件数にする', () => {
  const defs = { markers: { m1: { name: '侵色', maxStacks: 100 }, m2: { name: '恋', maxStacks: 10 }, m3: { name: '愛', maxStacks: 5 } }, statuses: { s1: { name: '毒', kind: 'damageOverTime' } } };
  const data = { find: (cat, id) => defs[cat]?.[id] ?? null };
  const unit = { markers: { m1: { stacks: 30 }, m2: { stacks: 10 }, m3: { stacks: 1 } }, statuses: [{ statusId: 's1', remainingTurns: 2 }] };
  const area = fieldStatusArea(unit, data, { stackLimit: 2, statusLimit: 3 });
  assert.deepEqual(area.stacks.map((m) => [m.name, m.value, m.max, m.pct, m.isMax]), [['恋', 10, 10, 100, true], ['侵色', 30, 100, 30, false]]);
  assert.equal(area.hiddenStacks, 1);
  assert.deepEqual(area.statuses.map((s) => [s.label, s.value]), [['毒', '2行動']]);
  assert.equal(area.hiddenStatuses, 0);
});
