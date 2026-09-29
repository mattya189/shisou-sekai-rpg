import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abilityCatalog,
  abilityDetail,
  abilityFilterOptions,
  abilityIsRevealed,
  filterAbilityCatalog,
  skillActionCountText,
} from '../../src/codex/abilities.js';
import { markMonster, countMonster } from '../../src/progression/codex.js';
import { loadModifiedData, loadRealData, newGameFixture } from '../helpers.js';

test('特技図鑑は戦闘データの特技・パッシブをIDごとに1件だけ登録する', async () => {
  const data = await loadRealData();
  const catalog = abilityCatalog(data);
  assert.equal(catalog.length, data.list('skills').length + data.list('passives').length);
  assert.equal(new Set(catalog.map((entry) => `${entry.type}:${entry.id}`)).size, catalog.length);
  assert.equal(catalog.find((entry) => entry.id === 'skill_015').users[0].monsterId, 'mon_007');
  assert.equal(catalog.find((entry) => entry.id === 'passive_006').users[0].monsterId, 'mon_007');
});

test('侵色弾の倍率・条件・関連スタック・習得条件は実戦データから詳細へ変換される', async () => {
  const data = await loadRealData();
  const detail = abilityDetail(data, 'skill', 'skill_015');
  assert.equal(detail.triggerText, '3の倍数回目の攻撃');
  assert.ok(detail.effects.some((text) => text.includes('80%') && text.includes('5%')));
  assert.deepEqual(detail.markers.map((marker) => marker.id), ['marker_001']);
  assert.deepEqual(detail.users.map(({ monsterId, rank, level }) => ({ monsterId, rank, level })), [{ monsterId: 'mon_007', rank: 1, level: 1 }]);
});

test('戦闘データの倍率を変えると図鑑詳細にも自動反映される', async () => {
  const data = await loadModifiedData((raw) => {
    raw.skills.find((skill) => skill.id === 'skill_015').effects[0].basePower = 0.95;
  });
  assert.ok(abilityDetail(data, 'skill', 'skill_015').effects.some((text) => text.includes('95%')));
});

test('通常・非攻撃・即時・コンボでターンと攻撃回数を誤説明しない', async () => {
  const data = await loadRealData();
  assert.match(skillActionCountText(data.get('skills', 'skill_015')), /増える/);
  assert.match(skillActionCountText(data.get('skills', 'skill_019')), /増えない（行動ターンは1進む）/);
  assert.match(skillActionCountText(data.get('skills', 'skill_026')), /ターンも消費しない/);
  assert.match(skillActionCountText(data.get('skills', 'skill_021')), /独立したターンではない/);
});

test('奥義・コンボ・パッシブの分類と1戦闘1回・関連状態を判別する', async () => {
  const data = await loadRealData();
  assert.equal(abilityDetail(data, 'skill', 'skill_023').kind, 'ultimate');
  assert.equal(abilityDetail(data, 'skill', 'skill_023').ability.oncePerBattle, true);
  assert.equal(abilityDetail(data, 'skill', 'skill_021').kind, 'combo');
  assert.equal(abilityDetail(data, 'passive', 'passive_006').kind, 'passive');
  const ink = abilityDetail(data, 'skill', 'skill_016');
  assert.deepEqual(ink.statuses.map((status) => status.id), ['status_005']);
  assert.match(ink.statuses[0].durationText, /行動2回/);
});

test('検索・分類・属性・攻撃回数・状態・スタックで絞り込める', async () => {
  const data = await loadRealData();
  const catalog = abilityCatalog(data);
  assert.deepEqual(filterAbilityCatalog(catalog, { query: '侵色弾' }).map((entry) => entry.id), ['skill_015']);
  assert.ok(filterAbilityCatalog(catalog, { kind: 'ultimate' }).every((entry) => entry.kind === 'ultimate'));
  assert.ok(filterAbilityCatalog(catalog, { element: 'elem_005' }).some((entry) => entry.id === 'skill_020'));
  assert.ok(filterAbilityCatalog(catalog, { trigger: 'attack:3' }).some((entry) => entry.id === 'skill_015'));
  assert.ok(filterAbilityCatalog(catalog, { trigger: 'status' }).some((entry) => entry.id === 'skill_016'));
  assert.ok(filterAbilityCatalog(catalog, { trigger: 'marker' }).some((entry) => entry.id === 'skill_015'));
  assert.ok(abilityFilterOptions(data).multiples.includes(3));
});

test('特技図鑑の解放は既存のモンスター図鑑段階をそのまま使う', async () => {
  const { data, save } = await newGameFixture();
  const skill = abilityCatalog(data).find((entry) => entry.id === 'skill_015');
  const passive = abilityCatalog(data).find((entry) => entry.id === 'passive_006');
  assert.equal(abilityIsRevealed(save, data, skill), false);
  markMonster(save, 'mon_007', 'encountered');
  markMonster(save, 'mon_007', 'defeated');
  countMonster(save, 'mon_007', 'defeated', 5);
  assert.equal(abilityIsRevealed(save, data, skill), true);
  assert.equal(abilityIsRevealed(save, data, passive), false);
  markMonster(save, 'mon_007', 'recruited');
  assert.equal(abilityIsRevealed(save, data, passive), true);
});
