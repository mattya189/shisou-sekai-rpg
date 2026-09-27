import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRealData, loadModifiedData } from '../helpers.js';

test('同梱データはすべて検証を通る', async () => {
  const data = await loadRealData();
  const { errors } = data.validate();
  assert.deepEqual(errors, []);
});

test('プロトタイプの必要数がそろっている', async () => {
  const data = await loadRealData();
  assert.ok(data.list('worlds').length >= 1);
  assert.ok(data.list('characters').length >= 2);
  assert.ok(data.list('monsters').length >= 5);
  assert.ok(data.list('items').length >= 10);
  assert.ok(data.list('locations').length >= 3);
});

test('すべてのモンスターに加入設定がある（全種類を仲間にできる。ボスは特殊条件）', async () => {
  const data = await loadRealData();
  for (const m of data.list('monsters')) {
    assert.ok(m.recruit && (m.recruit.baseRate > 0 || m.recruit.special), `${m.id} に加入率がない`);
    if (m.recruit.special) assert.ok(data.list('bosses').some((b) => b.monsterId === m.id && b.recruit), `${m.id} の特殊加入条件がない`);
  }
});

test('ゲームの固定上限を超えるユニットデータを拒否する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.characters[0].learnset = Array.from({ length: 11 }, () => ({ skillId: 'skill_001', level: 1 }));
    raw.characters[0].passives = ['passive_001', 'passive_002', 'passive_003'];
  });
  const { errors } = data.validate();
  assert.ok(errors.some((e) => e.includes('習得特技が 11 個')));
  assert.ok(errors.some((e) => e.includes('固有パッシブが 3 個')));
});

test('4体編成・特技5枠・装備2枠・品質5段階の固定値を検証する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.balance.party.size = 5;
    raw.balance.skills.maxEquipped = 6;
    raw.balance.equipment.slots = 3;
    raw.balance.qualities.pop();
  });
  const { errors } = data.validate();
  assert.ok(errors.some((e) => e.includes('party.size は4')));
  assert.ok(errors.some((e) => e.includes('skills.maxEquipped は5')));
  assert.ok(errors.some((e) => e.includes('equipment.slots は2')));
  assert.ok(errors.some((e) => e.includes('qualities は5段階')));
});

test('IDの重複を検出する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.monsters.push({ ...raw.monsters[0] });
  });
  assert.ok(data.validate().errors.some((e) => e.includes('重複')));
});

test('カテゴリをまたいだIDの重複も検出する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.items[0].id = 'mon_001';
  });
  const { errors } = data.validate();
  assert.ok(errors.some((e) => e.includes('重複')) || errors.some((e) => e.includes('形式')));
});

test('存在しないIDへの参照を検出する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.monsters[0].learnset.push({ skillId: 'skill_999', level: 1 });
  });
  assert.ok(data.validate().errors.some((e) => e.includes('skill_999')));
});

test('表示名のようなIDを拒否する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.items[0].id = '月光草';
  });
  assert.ok(data.validate().errors.some((e) => e.includes('形式')));
});

test('未登録の発動条件を検出する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.skills[0].trigger = { type: 'unknownCondition' };
  });
  assert.ok(data.validate().errors.some((e) => e.includes('unknownCondition')));
});

test('発動条件の必須パラメータ不足を検出する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.skills[0].trigger = { type: 'attackCountMultiple' };
  });
  assert.ok(data.validate().errors.some((e) => e.includes('パラメータ n')));
});

test('状態異常は時間または対象の行動回数を継続基準にできる', async () => {
  const data = await loadModifiedData((raw) => {
    const status = raw.statuses[0];
    delete status.durationMs;
    delete status.params.tickMs;
    status.durationTurns = 2;
    status.turnTiming = 'actionStart';
  });
  assert.deepEqual(data.validate().errors, []);
});

test('状態異常の継続基準重複と特技の不正な攻撃扱い設定を拒否する', async () => {
  const data = await loadModifiedData((raw) => {
    raw.statuses[0].durationTurns = 2;
    raw.skills[0].countsAsAttack = 'no';
  });
  const { errors } = data.validate();
  assert.ok(errors.some((e) => e.includes('durationMs または durationTurns')));
  assert.ok(errors.some((e) => e.includes('countsAsAttack')));
});

test('get は存在しないIDで例外、find は null', async () => {
  const data = await loadRealData();
  assert.throws(() => data.get('monsters', 'mon_999'));
  assert.equal(data.find('monsters', 'mon_999'), null);
  assert.equal(data.getUnitDef('chr_001').kind, 'character');
  assert.equal(data.getUnitDef('mon_001').kind, 'monster');
});
