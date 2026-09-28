import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, advance, effectiveInterval, effectiveStat } from '../../src/battle/engine.js';
import { learnedSkillIds, setEquippedSkills } from '../../src/progression/skillLoadout.js';
import { loadBattleData, loadRealData } from '../helpers.js';

const irowan = (over = {}) => ({ defId: 'mon_008', level: 40, rank: 5, usesMp: false, ...over });
const someime = (over = {}) => ({ defId: 'mon_007', level: 40, rank: 5, usesMp: false, ...over });
const sandbag = (over = {}) => ({ defId: 'mon_900', ...over });
const marker = (unit, markerId, stacks) => { unit.markers[markerId] = { stacks, reachedMaxAt: null }; };
const actions = (battle, actorId = 'a1') => battle.log.filter((e) => e.type === 'action' && e.actorId === actorId);
const action = (battle, actorId = 'a1') => actions(battle, actorId).at(-1);
const withoutFriendlyChance = (raw) => {
  raw.passives.find((p) => p.id === 'passive_008').effects[0].chance = 0;
};

test('犬の好意は最大10で止まる', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: [] })], enemies: [sandbag()], seed: 1 });
  marker(b.units[0], 'marker_002', 10);
  marker(b.units[1], 'marker_001', 22);
  advance(b, data, 1850);
  assert.equal(b.units[0].markers.marker_002.stacks, 10);
});

test('イロワン以外の犬族も犬の好意を利用でき、ユニットごとに個別保持する', async () => {
  const data = await loadBattleData((raw) => {
    raw.passives.find((p) => p.id === 'passive_008').effects[0].chance = 1;
    const dog = raw.monsters.find((m) => m.id === 'mon_900');
    dog.speciesIds = ['species_003'];
    dog.passives = ['passive_008'];
    dog.baseStats.attackIntervalMs = 1000;
  });
  const b = createBattle(data, {
    allies: [{ defId: 'mon_900', skills: [] }, { defId: 'mon_900', skills: [] }],
    enemies: [sandbag()], seed: 1,
  });
  b.units[1].nextAttackAt = 10_000_000;
  advance(b, data, 1000);
  assert.equal(b.units[0].defId, 'mon_900', 'イロワンIDへ依存しない');
  assert.equal(b.units[0].markers.marker_002.stacks, 1);
  assert.equal(b.units[1].markers.marker_002, undefined, '同じ犬族でもスタックは共有しない');
});

test('非犬族は犬の好意を意図せず獲得しない', async () => {
  const data = await loadBattleData((raw) => {
    raw.passives.find((p) => p.id === 'passive_008').effects[0].chance = 1;
    const nonDog = raw.monsters.find((m) => m.id === 'mon_900');
    nonDog.speciesIds = ['species_002'];
    nonDog.passives = ['passive_008'];
    nonDog.baseStats.attackIntervalMs = 1000;
  });
  const b = createBattle(data, { allies: [{ defId: 'mon_900', skills: [] }], enemies: [sandbag()], seed: 1 });
  advance(b, data, 1000);
  assert.equal(b.units[0].markers.marker_002, undefined);
});

test('好意の色は侵色11を消費して犬の好意+1、侵色10以下では発動しない', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: [] })], enemies: [sandbag()], seed: 1 });
  marker(b.units[1], 'marker_001', 22);
  advance(b, data, 1850);
  assert.deepEqual([b.units[1].markers.marker_001.stacks, b.units[0].markers.marker_002.stacks], [11, 1]);
  advance(b, data, 1850);
  assert.deepEqual([b.units[1].markers.marker_001.stacks, b.units[0].markers.marker_002.stacks], [0, 2]);
  advance(b, data, 1850);
  assert.deepEqual([b.units[1].markers.marker_001.stacks, b.units[0].markers.marker_002.stacks], [0, 2]);
});

test('人懐っこいは物理攻撃命中時に確率で犬の好意を得る', async () => {
  const data = await loadBattleData((raw) => { raw.passives.find((p) => p.id === 'passive_008').effects[0].chance = 1; });
  const b = createBattle(data, { allies: [irowan({ skills: [] })], enemies: [sandbag()], seed: 1 });
  advance(b, data, 1850);
  assert.equal(b.units[0].markers.marker_002.stacks, 1);
});

test('ソメイムとイロワンは同じ侵色IDを共有し、侵色22を2回で消費できる', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [someime({ skills: [] }), irowan({ skills: [] })], enemies: [sandbag()], seed: 1 });
  marker(b.units[2], 'marker_001', 22);
  b.units[0].nextAttackAt = 10_000_000;
  advance(b, data, 3700);
  assert.deepEqual([b.units[2].markers.marker_001.stacks, b.units[1].markers.marker_002.stacks], [0, 2]);
  assert.equal(data.list('markers').filter((m) => m.name === '侵色').length, 1);
});

test('色彩連牙は10の倍数で発動し、好意があれば追加攻撃しても攻撃回数は1だけ進む', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_025'] })], enemies: [sandbag()], seed: 1 });
  b.units[0].attackCount = 9;
  marker(b.units[0], 'marker_002', 1);
  advance(b, data, 1850);
  assert.equal(action(b).skillId, 'skill_025');
  assert.equal(action(b).results.filter((r) => r.kind === 'damage').length, 2);
  assert.equal(b.units[0].attackCount, 10);
});

test('あまえるは3への到達時に即時発動し、減少後の再到達で再発動する', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_026'] })], enemies: [sandbag()], seed: 1 });
  marker(b.units[0], 'marker_002', 2);
  marker(b.units[1], 'marker_001', 22);
  advance(b, data, 1850);
  assert.equal(actions(b).filter((e) => e.skillId === 'skill_026').length, 1);
  assert.ok(b.units[1].statuses.some((s) => s.statusId === 'status_010'));
  marker(b.units[0], 'marker_002', 2);
  advance(b, data, 1850);
  assert.equal(actions(b).filter((e) => e.skillId === 'skill_026').length, 2);
});

test('レインボー噛みつきは4の倍数で発動し、seed固定で攻撃属性を選ぶ', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const run = () => {
    const b = createBattle(data, { allies: [irowan({ skills: ['skill_027'] })], enemies: [sandbag()], seed: 77 });
    b.units[0].attackCount = 3;
    advance(b, data, 1850);
    return action(b).results.find((r) => r.kind === 'damage').element;
  };
  const element = run();
  assert.ok(data.list('elements').filter((e) => e.attackElement).some((e) => e.id === element));
  assert.equal(run(), element);
});

test('犬のとうぼえは5ターン目のみ、敵味方双方の犬へ付与される', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, {
    allies: [irowan({ skills: ['skill_028'] }), irowan({ skills: [] })],
    enemies: [irowan({ skills: [] })], seed: 1,
  });
  b.units[0].turnCount = 4;
  b.units[1].nextAttackAt = 10_000_000;
  b.units[2].nextAttackAt = 10_000_000;
  advance(b, data, 1850);
  assert.equal(action(b).skillId, 'skill_028');
  assert.equal(action(b).countsAsAttack, false);
  assert.ok(b.units.every((u) => u.statuses.some((s) => s.statusId === 'status_011')));
  assert.equal(effectiveStat(b.units[1], 'atk'), b.units[1].stats.atk * 1.1);
});

test('犬のとうぼえは対象自身の3行動後に終了する', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_028'] })], enemies: [irowan({ skills: [] })], seed: 1 });
  b.units[0].turnCount = 4;
  b.units[1].nextAttackAt = 10_000_000;
  advance(b, data, 1850);
  b.units[0].skills = [];
  advance(b, data, 5550);
  assert.equal(b.units[0].statuses.some((s) => s.statusId === 'status_011'), false);
});

test('睨みつけるは被ダメージ時だけ判定し、休み成功率へ耐性が反映される', async () => {
  const always = (raw) => {
    raw.monsters.find((m) => m.id === 'mon_008').baseStats.evasion = 0;
    raw.skills.find((s) => s.id === 'skill_029').immediateTrigger.chance = 1;
    raw.skills.find((s) => s.id === 'skill_029').effects[0].chance = 1;
  };
  const data = await loadBattleData(always);
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_029'] })], enemies: [{ defId: 'mon_901', skills: [] }], seed: 1 });
  advance(b, data, 1000);
  assert.ok(b.units[1].statuses.some((s) => s.statusId === 'status_012'));
  assert.equal(actions(b).filter((e) => e.skillId === 'skill_029').length, 1);

  const resistedData = await loadBattleData((raw) => {
    always(raw);
    raw.monsters.find((m) => m.id === 'mon_901').statusResistances = { status_012: 1 };
  });
  const c = createBattle(resistedData, { allies: [irowan({ skills: ['skill_029'] })], enemies: [{ defId: 'mon_901', skills: [] }], seed: 1 });
  advance(c, resistedData, 1000);
  assert.equal(c.units[1].statuses.some((s) => s.statusId === 'status_012'), false);
});

test('休みは次の行動をスキップし、ターンだけ進める', async () => {
  const data = await loadBattleData((raw) => {
    raw.monsters.find((m) => m.id === 'mon_008').baseStats.evasion = 0;
    raw.skills.find((s) => s.id === 'skill_029').immediateTrigger.chance = 1;
    raw.skills.find((s) => s.id === 'skill_029').effects[0].chance = 1;
  });
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_029'] })], enemies: [{ defId: 'mon_901', skills: [] }], seed: 1 });
  advance(b, data, 1000);
  b.units[0].nextAttackAt = 10_000_000;
  advance(b, data, 1000);
  const skipped = actions(b, 'e1').find((e) => e.kind === 'skipped');
  assert.ok(skipped);
  assert.deepEqual([b.units[1].turnCount, b.units[1].attackCount], [2, 1]);
});

test('ドッグランは犬数で威力上昇し、攻撃回数を直接増加しても別特技を即時発動しない', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const solo = createBattle(data, { allies: [irowan({ skills: ['skill_030'] })], enemies: [sandbag()], seed: 1 });
  solo.units[0].attackCount = 5;
  advance(solo, data, 1850);
  const soloDamage = action(solo).results.find((r) => r.kind === 'damage').amount;

  const pack = createBattle(data, { allies: [irowan({ skills: ['skill_030'] }), irowan({ skills: ['skill_030'] })], enemies: [sandbag()], seed: 1 });
  pack.units[0].attackCount = 5;
  pack.units[1].attackCount = 5;
  pack.units[1].nextAttackAt = 10_000_000;
  advance(pack, data, 1850);
  const packDamage = action(pack).results.find((r) => r.kind === 'damage').amount;
  assert.ok(packDamage > soloDamage);
  assert.equal(pack.units[0].attackCount, 7);
  assert.equal(pack.units[1].attackCount, 6);
  assert.equal(actions(pack, 'a2').length, 0, '直接加算だけでは6の倍数特技を発動しない');
});

test('デペントは15の倍数で侵色8～12をseed固定で付与する', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const run = () => {
    const b = createBattle(data, { allies: [irowan({ skills: ['skill_031'] })], enemies: [sandbag()], seed: 33 });
    b.units[0].attackCount = 14;
    advance(b, data, 1850);
    return b.units[1].markers.marker_001.stacks;
  };
  assert.ok(run() >= 8 && run() <= 12);
  assert.equal(run(), run());
});

test('虹のブレスは敵全体へ1回ずつ、対象ごとの最有効属性で攻撃する', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_032'] })], enemies: [sandbag(), sandbag()], seed: 1 });
  b.units[0].attackCount = 7;
  b.units[1].elementMultipliers = { elem_002: 2, elem_003: 0.5 };
  b.units[2].elementMultipliers = { elem_005: 2.5, elem_002: 0.5 };
  advance(b, data, 1850);
  const damage = action(b).results.filter((r) => r.kind === 'damage');
  assert.equal(damage.length, 2, '全属性は属性数ぶんの多段攻撃にしない');
  assert.deepEqual(damage.map((r) => r.element), ['elem_002', 'elem_005']);
});

test('虹の空気爆発は虹のブレス後の次の実際の攻撃直前に1回だけ発動する', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_032', 'skill_033'] })], enemies: [sandbag()], seed: 1 });
  b.units[0].attackCount = 7;
  advance(b, data, 1850);
  assert.equal(b.units[0].pendingAttackEffects.length, 1);
  advance(b, data, 1850);
  assert.equal(action(b).results.filter((r) => r.kind === 'damage').length, 2, '連携追加攻撃＋本来の通常攻撃');
  assert.ok(action(b).results.some((r) => r.kind === 'attackComboTriggered'));
  assert.equal(b.units[0].pendingAttackEffects.length, 0);
  assert.equal(b.units[0].attackCount, 9, '連携追加攻撃では攻撃回数が余分に増えない');
});

test('奥義は好意10到達時に即時1回だけ発動し、敵へ5ターンの複数デバフと100～500%攻撃', async () => {
  const data = await loadBattleData(withoutFriendlyChance);
  const b = createBattle(data, { allies: [irowan({ skills: ['skill_034'] })], enemies: [sandbag()], seed: 1 });
  marker(b.units[0], 'marker_002', 9);
  marker(b.units[1], 'marker_001', 22);
  advance(b, data, 1850);
  const ult = actions(b).find((e) => e.skillId === 'skill_034');
  assert.ok(ult);
  assert.equal(b.units[0].markers.marker_002.stacks, 0);
  assert.equal(ult.results.filter((r) => r.kind === 'damage').length, 1);
  const atk = effectiveStat(b.units[0], 'atk');
  assert.ok(ult.results.find((r) => r.kind === 'damage').amount >= atk && ult.results.find((r) => r.kind === 'damage').amount <= atk * 5);
  assert.ok(b.units[1].statuses.some((s) => s.statusId === 'status_013' && s.remainingTurns === 5));
  assert.ok(b.units[1].statuses.some((s) => s.statusId === 'status_014' && s.remainingTurns === 5));
  assert.equal(effectiveStat(b.units[1], 'atk'), b.units[1].stats.atk * 0.5);
  assert.equal(effectiveInterval(b.units[1]), Math.round(b.units[1].stats.attackIntervalMs * 1.3));
  assert.equal(b.units[0].statuses.some((s) => ['status_013', 'status_014'].includes(s.statusId)), false);

  marker(b.units[0], 'marker_002', 9);
  marker(b.units[1], 'marker_001', 11);
  advance(b, data, 1850);
  assert.equal(actions(b).filter((e) => e.skillId === 'skill_034').length, 1);
  assert.equal(b.units[0].markers.marker_002.stacks, 10);
});

test('イロワンの特技習得はランクとレベルのAND条件で合計10個', async () => {
  const data = await loadRealData();
  const ids = (rank, level) => learnedSkillIds(data, { defId: 'mon_008', rank, level, extraSkills: [] });
  assert.deepEqual(ids(1, 1), ['skill_025']);
  assert.deepEqual(ids(1, 14), ['skill_025', 'skill_026']);
  assert.equal(ids(1, 100).includes('skill_028'), false);
  assert.ok(ids(3, 20).includes('skill_032'));
  assert.equal(ids(3, 100).includes('skill_033'), false);
  assert.equal(ids(5, 40).length, 10);
});

test('イロワンも最大5特技セット制限に従う', async () => {
  const data = await loadRealData();
  const unit = { defId: 'mon_008', rank: 5, level: 40, extraSkills: [], equippedSkills: [] };
  const save = { units: { irowan: unit } };
  const learned = learnedSkillIds(data, unit);
  setEquippedSkills(save, data, 'irowan', learned.slice(0, 5));
  assert.equal(unit.equippedSkills.length, 5);
  assert.throws(() => setEquippedSkills(save, data, 'irowan', learned.slice(0, 6)), /5個まで/);
});

test('イロワンは自然属性・色命族/犬タグ・正式画像・加入・草原入口配置を持つ', async () => {
  const data = await loadRealData();
  const mon = data.get('monsters', 'mon_008');
  assert.equal(mon.element, 'elem_006');
  assert.deepEqual(mon.speciesIds, ['species_001', 'species_003']);
  assert.equal(mon.image, 'img/monsters/mon_008.png');
  assert.ok(mon.recruit.baseRate > 0);
  assert.ok(data.get('encounters', 'enc_001').entries.some((e) => e.enemies.some((x) => x.defId === 'mon_008')));
});
