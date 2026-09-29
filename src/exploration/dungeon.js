/**
 * 連戦ダンジョン（dungeons.json）。
 *
 *   冒険先の入口で「入る」→ スタミナ balance.dungeon.enterAp を使う
 *   stages を順番に戦う（encounterTableId なら抽選、bossId ならボス）
 *   HPもMPも戦闘ごとに回復しない（MPは dungeonRun.mp に保存して次の戦闘へ持ち越す）
 *   戦闘の合間に撤退できる。最後のステージに勝つと踏破
 *   全滅したら街へ戻る（戦闘結果の反映で処理）。時間切れはダンジョンから出る
 *
 * 進行状況はセーブの dungeonRun に保存されるので、途中でブラウザを閉じても続きから再開できる。
 */
import { GameError } from '../core/errors.js';
import { countItem } from '../progression/inventory.js';
import { aliveMembers } from '../progression/hp.js';
import { battleResult } from '../battle/engine.js';
import { rollEncounter } from './encounters.js';
import { currentNodeId } from './map.js';
import { advanceTime, situationAt } from './time.js';
import { spendStamina, syncStamina } from './stamina.js';

export function dungeonAt(data, nodeId) {
  const node = data.findNode(nodeId);
  return node?.dungeonId ? data.get('dungeons', node.dungeonId) : null;
}

/** 入れるかどうかと理由 */
export function dungeonEntryStatus(save, data, dungeonId, now = Date.now()) {
  const d = data.get('dungeons', dungeonId);
  const missing = (d.requires?.items ?? []).filter((id) => countItem(save, id) <= 0);
  const missingFlags = (d.requires?.flags ?? []).filter((f) => !save.flags[f]);
  const ap = data.balance.dungeon.enterAp;
  syncStamina(save, data, now);
  if (missing.length || missingFlags.length) return { ok: false, reason: d.lockedHint ?? 'まだ入れない' };
  if (save.exploration.actionPoints < ap) return { ok: false, reason: `スタミナが足りません（必要 ${ap}）` };
  if (aliveMembers(save, data).length === 0) return { ok: false, reason: 'パーティが全員倒れています' };
  return { ok: true, reason: null };
}

export function enterDungeon(save, data, dungeonId, rng, now = Date.now()) {
  if (save.dungeonRun) throw new GameError('in_dungeon', 'すでにダンジョンの中です');
  const d = data.get('dungeons', dungeonId);
  if (currentNodeId(save) !== d.entranceNodeId) throw new GameError('not_here', 'ここからは入れません');
  const st = dungeonEntryStatus(save, data, dungeonId, now);
  if (!st.ok) throw new GameError('cannot_enter', st.reason);
  spendStamina(save, data, data.balance.dungeon.enterAp, now);
  save.dungeonRun = { dungeonId, stage: 0, mp: {} };
  advanceTime(save, data, 1, rng);
  return save.dungeonRun;
}

/** 次の戦闘の内容（戦闘画面に渡すパラメータ） */
export function nextDungeonBattle(save, data, rng) {
  const run = save.dungeonRun;
  if (!run) throw new GameError('not_in_dungeon', 'ダンジョンに入っていません');
  if (aliveMembers(save, data).length === 0) throw new GameError('party_down', 'パーティが全員倒れています');
  const d = data.get('dungeons', run.dungeonId);
  const stage = d.stages[run.stage];
  let enemies;
  if (stage.bossId) {
    enemies = [{ bossId: stage.bossId }];
  } else {
    enemies = rollEncounter(data, stage.encounterTableId, situationAt(save, data, d.entranceNodeId), rng);
    if (!enemies) throw new GameError('no_enemy', '敵が見つかりませんでした');
  }
  return { enemies, mode: 'dungeon', source: 'dungeon', isBoss: Boolean(stage.bossId) };
}

/** 味方のMP（ダンジョン中は前の戦闘から持ち越す） */
export function dungeonMp(save) {
  return save.dungeonRun?.mp ?? null;
}

/**
 * ダンジョン内の戦闘結果を進行状況に反映する（HP・報酬は battleOutcome で反映済みの前提）。
 * @returns {{ cleared: boolean, ended: boolean, stage: number }}
 */
export function afterDungeonBattle(save, data, battle) {
  const run = save.dungeonRun;
  if (!run) return { cleared: false, ended: true, stage: 0 };
  const r = battleResult(battle);
  if (r.outcome !== 'won') {
    save.dungeonRun = null;
    return { cleared: false, ended: true, stage: run.stage };
  }
  for (const a of r.allies) if (a.unitId) run.mp[a.unitId] = a.mp;
  run.stage += 1;
  const d = data.get('dungeons', run.dungeonId);
  if (run.stage >= d.stages.length) {
    save.dungeons.cleared[d.id] = (save.dungeons.cleared[d.id] ?? 0) + 1;
    save.dungeonRun = null;
    return { cleared: true, ended: true, stage: run.stage };
  }
  return { cleared: false, ended: false, stage: run.stage };
}

export function retreatDungeon(save) {
  if (!save.dungeonRun) throw new GameError('not_in_dungeon', 'ダンジョンに入っていません');
  save.dungeonRun = null;
}
