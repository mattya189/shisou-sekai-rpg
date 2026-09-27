/**
 * 選択式フィールドの移動。街と地点はノード、connections でつながる。
 * 通常の移動は行動力を使わず、距離（distance）ぶんゲーム内時間が進む。
 * 接続に apCost を書くと、その移動だけ行動力を使う（危険な移動など）。
 * requires（flags / items）を満たさない接続は通れない。
 */
import { GameError } from '../core/errors.js';
import { countItem } from '../progression/inventory.js';
import { advanceTime } from './time.js';

export function currentNodeId(save) {
  return save.exploration.locationId ?? save.exploration.townId;
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
}
