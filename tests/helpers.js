import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadGameData, GameData } from '../src/core/gameData.js';
import { createRng } from '../src/core/rng.js';
import { createNewGame } from '../src/game/newGame.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadRealData() {
  return loadGameData(async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8')), 'data/');
}

/** 実データを複製して一部を書き換えたGameDataを作る（検証テスト用） */
export async function loadModifiedData(modify) {
  const data = await loadRealData();
  const raw = structuredClone(data.raw);
  modify(raw);
  return new GameData(raw);
}

export async function newGameFixture(seed = 1) {
  const data = await loadRealData();
  const save = createNewGame(data, createRng(seed));
  return { data, save };
}

/**
 * 戦闘テスト用のデータ。実データにテスト用ユニット・特技を足し、ダメージの乱数幅を0にする。
 *   chr_900 テスト役    : HP1000 MP100 攻撃100 防御0 攻撃間隔2秒、全特技をLv1で習得
 *   mon_900 サンドバッグ: HP100000 防御0、攻撃しない（間隔が制限時間より長い）
 *   mon_901 攻撃役      : HP100000 攻撃10 攻撃間隔1秒、skill_001 を習得
 *   skill_900〜902      : 1回目の攻撃で毒/麻痺/攻撃ダウンを確定付与（MP0）
 */
export async function loadBattleData(modify = () => {}) {
  return loadModifiedData((raw) => {
    raw.balance.battle.damageVariance = 0;
    const zero = { hp: 0, mp: 0, atk: 0, def: 0 };
    const allSkills = raw.skills.map((s) => ({ skillId: s.id, level: 1 }));
    raw.characters.push({
      id: 'chr_900', name: 'テスト役', element: 'elem_001',
      baseStats: { hp: 1000, mp: 100, atk: 100, def: 0, attackIntervalMs: 2000 },
      growth: zero, elementMultipliers: {}, learnset: allSkills, passives: [],
    });
    const mon = (id, name, baseStats, extra = {}) => ({
      id, name, worldId: 'world_001', element: 'elem_001', baseStats, growth: zero,
      elementMultipliers: {}, learnset: [], passives: [], drops: [], recruit: { baseRate: 0.1 }, ...extra,
    });
    raw.monsters.push(
      mon('mon_900', 'サンドバッグ', { hp: 100000, mp: 0, atk: 1, def: 0, attackIntervalMs: 10_000_000 }),
      mon('mon_901', '攻撃役', { hp: 100000, mp: 0, atk: 10, def: 0, attackIntervalMs: 1000 }, {
        learnset: [{ skillId: 'skill_001', level: 1 }],
      }),
    );
    const once = { type: 'attackCountEvery', n: 1000, start: 1 };
    const statusSkill = (id, statusId) => ({
      id, name: id, mpCost: 0, trigger: once,
      effects: [{ type: 'applyStatus', target: 'enemySingle', statusId }],
    });
    raw.skills.push(statusSkill('skill_900', 'status_001'), statusSkill('skill_901', 'status_002'), statusSkill('skill_902', 'status_003'));
    modify(raw);
  });
}

/** 指定ユニットの行動を [時刻, 種類, 特技ID] の配列で取り出す */
export function actionsOf(battle, actorId) {
  return battle.log
    .filter((e) => e.type === 'action' && e.actorId === actorId)
    .map((e) => [e.t, e.kind, e.skillId]);
}

/** 指定ユニットの行動で与えたダメージ量の配列 */
export function damagesOf(battle, actorId) {
  return battle.log
    .filter((e) => e.type === 'action' && e.actorId === actorId)
    .map((e) => e.results.filter((r) => r.kind === 'damage').reduce((a, r) => a + r.amount, 0));
}
