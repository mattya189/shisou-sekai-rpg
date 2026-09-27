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

test('get は存在しないIDで例外、find は null', async () => {
  const data = await loadRealData();
  assert.throws(() => data.get('monsters', 'mon_999'));
  assert.equal(data.find('monsters', 'mon_999'), null);
  assert.equal(data.getUnitDef('chr_001').kind, 'character');
  assert.equal(data.getUnitDef('mon_001').kind, 'monster');
});
