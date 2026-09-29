/**
 * v2の正式進行は冒険先の直接選択。connections / moveTo は旧セーブ・旧テストとの
 * 互換用に残し、新しいUIからは呼ばない。
 */
import { GameError } from '../core/errors.js';
import { countItem } from '../progression/inventory.js';
import { advanceTime } from './time.js';

export function currentNodeId(save) {
  return save.exploration.adventureId ?? save.exploration.locationId ?? save.exploration.townId;
}

export function isInTown(save) {
  return save.exploration.locationId === null;
}

function requirementMet(save, requires) {
  if (!requires) return true;
  if ((requires.flags ?? []).some((f) => !save.flags[f])) return false;
  if ((requires.items ?? []).some((id) => countItem(save, id) <= 0)) return false;
  return true;
}

/**
 * 現在地とは無関係に、世界内の冒険先を列挙する。
 * adventureRequires が無い場所は最初から選択できる。
 */
export function listAdventureDestinations(save, data, worldId = save.exploration.worldId) {
  return data.list('locations')
    .filter((loc) => loc.worldId === worldId)
    .map((loc) => ({
      id: loc.id,
      node: loc,
      locked: !requirementMet(save, loc.adventureRequires),
      hint: loc.adventureLockedHint ?? null,
      visited: save.exploration.discoveredNodes.includes(loc.id),
    }));
}

/** 冒険先を選ぶだけ。スタミナ・ゲーム内時間・天候は変化しない。 */
export function selectAdventure(save, data, locationId) {
  if (save.exploration.pendingEvent) throw new GameError('pending_event', '先に現在の探索結果を確認してください');
  const destination = listAdventureDestinations(save, data).find((entry) => entry.id === locationId);
  if (!destination) throw new GameError('unknown_adventure', 'その冒険先は選べません');
  if (destination.locked) throw new GameError('locked', destination.hint ? `まだ解放されていません。${destination.hint}` : 'まだ解放されていません');
  save.exploration.adventureId = locationId;
  if (!save.exploration.discoveredNodes.includes(locationId)) save.exploration.discoveredNodes.push(locationId);
  return destination.node;
}

/**
 * 今いる場所から行ける場所の一覧
 * @returns {{ to: string, node: any, distance: number, apCost: number, locked: boolean, hint: string | null, visited: boolean }[]}
 */
export function listConnections(save, data) {
  const here = data.findNode(currentNodeId(save));
  return (here?.connections ?? [])
    .map((c) => ({
      to: c.to,
      node: data.findNode(c.to),
      distance: c.distance ?? 1,
      apCost: c.apCost ?? 0,
      locked: !requirementMet(save, c.requires),
      hint: c.lockedHint ?? null,
      visited: save.exploration.discoveredNodes.includes(c.to),
    }))
    .filter((c) => c.node);
}

export function moveTo(save, data, toId, rng) {
  if (save.exploration.pendingEvent) throw new GameError('pending_event', '先に現在の探索結果を確認してください');
  const conn = listConnections(save, data).find((c) => c.to === toId);
  if (!conn) throw new GameError('not_connected', 'そこへは行けません');
  if (conn.locked) throw new GameError('locked', conn.hint ? `まだ通れない。${conn.hint}` : 'まだ通れません');
  if (conn.apCost > save.exploration.actionPoints) {
    throw new GameError('not_enough_ap', `行動力が足りません（必要 ${conn.apCost}）`);
  }
  save.exploration.actionPoints -= conn.apCost;
  const isTown = data.has('towns', toId);
  if (isTown) {
    save.exploration.townId = toId;
    save.exploration.locationId = null;
  } else {
    save.exploration.locationId = toId;
  }
  if (!save.exploration.discoveredNodes.includes(toId)) save.exploration.discoveredNodes.push(toId);
  const time = advanceTime(save, data, conn.distance, rng);
  return { node: conn.node, isTown, ...time };
}

/** 全滅などで最後の街へ戻す */
export function returnToTown(save) {
  save.exploration.locationId = null;
  save.exploration.pendingEvent = null;
}
