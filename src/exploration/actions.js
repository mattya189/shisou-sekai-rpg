/**
 * 地点での探索行動。地点データの actions に書いた行動だけが使える。
 * 行動力と進む時間は balance.exploration.actions で調整する。
 *
 * 新しい行動を追加するときは:
 *   1. EXPLORE_ACTIONS に1件追加（run が結果を返す）
 *   2. balance.exploration.actions に ap / time を追加
 *   3. 地点データの actions に追加
 *
 * run が返す結果（outcome）:
 *   { kind: 'encounter', enemies: [{ defId, level }] }
 *   { kind: 'items', items: [{ itemId, quality, qty }], message }
 *   { kind: 'secret', flag, message, items, currencies }
 *   { kind: 'nothing', message }
 *   { kind: 'strongHint', optionalEncounterId, message }
 */
import { GameError } from '../core/errors.js';
import { addItem, addCurrency } from '../progression/inventory.js';
import { rollQuality } from '../progression/quality.js';
import { aliveMembers } from '../progression/hp.js';
import { rollEncounter } from './encounters.js';
import { matchesWhen } from './when.js';
import { advanceTime, situationAt } from './time.js';
import { currentNodeId, isInTown } from './map.js';

function encounter(c, encounterTableId = c.node.encounterTableId) {
  if (!encounterTableId) return null;
  const enemies = rollEncounter(c.data, encounterTableId, c.situation, c.rng);
  return enemies ? { kind: 'encounter', enemies } : null;
}

/** 採取テーブルから times 回抽選（品質は天候・地点・追加補正で上がりやすくなる） */
function gatherItems(c, times, extraBonus = 0) {
  const table = (c.node.gathering ?? []).filter((g) => matchesWhen(g.when, c.situation));
  if (!table.length) return [];
  const bonus = (c.weather?.qualityBonus ?? 0) + (c.node.qualityBonus ?? 0) + extraBonus;
  const items = [];
  for (let i = 0; i < times; i++) {
    const g = c.rng.weighted(table);
    const item = c.data.get('items', g.itemId);
    const qty = c.rng.int(g.qty?.[0] ?? 1, g.qty?.[1] ?? 1);
    const quality = item.hasQuality ? rollQuality(c.data, c.rng, bonus) : 'q1';
    items.push({ itemId: g.itemId, quality, qty });
  }
  return items;
}

/**
 * 地点の explorationEvents から「探索する」の結果を選ぶ。
 * 未定義の地点は従来の encounterRate による抽選へフォールバックする。
 */
function locationExploreEvent(c) {
  const table = (c.node.explorationEvents ?? []).filter((event) => matchesWhen(event.when, c.situation));
  if (!table.length) return null;
  const event = c.rng.weighted(table);
  const common = { eventId: event.id, eventType: event.type, message: event.message };
  if (event.type === 'encounter') {
    const rolled = encounter(c, event.encounterTableId);
    return rolled ? { ...rolled, ...common } : { kind: 'nothing', ...common };
  }
  if (event.type === 'gather' || event.type === 'treasure') {
    const items = gatherItems(c, event.times ?? (event.type === 'treasure' ? 2 : 1), event.qualityBonus ?? 0);
    return items.length ? { kind: 'items', items, ...common } : { kind: 'nothing', ...common };
  }
  if (event.type === 'strongHint') {
    const strong = (c.node.optionalEncounters ?? []).find((entry) => entry.id === event.optionalEncounterId);
    return strong ? { kind: 'strongHint', optionalEncounterId: strong.id, ...common } : { kind: 'nothing', ...common };
  }
  if (event.type === 'choice') {
    const choices = event.choices.map((choice) => {
      const rolled = choice.encounterTableId ? encounter(c, choice.encounterTableId) : null;
      return { ...structuredClone(choice), enemies: rolled?.enemies };
    });
    return { kind: 'choice', choices, ...common };
  }
  return {
    kind: event.rewards ? 'items' : 'nothing',
    items: (event.rewards?.items ?? []).map((it) => ({ itemId: it.itemId, quality: it.quality ?? 'q1', qty: it.qty ?? 1 })),
    currencies: event.rewards?.currencies ?? [],
    ...common,
  };
}

export const EXPLORE_ACTIONS = {
  explore: {
    name: '探索する',
    description: '辺りを歩き回る。モンスターに出会ったり、何かを拾ったりする。',
    mayBattle: true,
    run(c) {
      const event = locationExploreEvent(c);
      if (event) return event;
      const rate = Math.min(0.95, (c.node.encounterRate ?? 0.5) * (c.weather?.encounterRate ?? 1));
      if (c.rng.chance(rate)) {
        const e = encounter(c);
        if (e) return e;
      }
      if (c.rng.chance(c.data.balance.exploration.exploreFindItemRate)) {
        const items = gatherItems(c, 1);
        if (items.length) return { kind: 'items', items, message: '歩いていると何かを見つけた。' };
      }
      return { kind: 'nothing', message: '特に何も見つからなかった。' };
    },
  },
  gather: {
    name: '採取する',
    description: 'この場所の素材を集める。天候によって品質が変わる。',
    run(c) {
      const items = gatherItems(c, c.rng.int(1, 2));
      return items.length ? { kind: 'items', items, message: '採取した。' } : { kind: 'nothing', message: 'ここで採取できるものはない。' };
    },
  },
  searchMonsters: {
    name: 'モンスターを探す',
    description: '必ずモンスターと戦闘になる。',
    mayBattle: true,
    run(c) {
      return encounter(c) ?? { kind: 'nothing', message: 'モンスターは見つからなかった。' };
    },
  },
  investigate: {
    name: '詳しく調べる',
    description: '時間をかけて調べる。隠されたものが見つかることがある。採取物の品質も上がりやすい。',
    run(c) {
      for (const sc of c.node.secrets ?? []) {
        if (c.save.flags[sc.flag] || !matchesWhen(sc.when, c.situation)) continue;
        if (!c.rng.chance(sc.chance ?? 1)) continue;
        return {
          kind: 'secret',
          flag: sc.flag,
          message: sc.message,
          items: (sc.rewards?.items ?? []).map((it) => ({ itemId: it.itemId, quality: it.quality ?? 'q1', qty: it.qty ?? 1 })),
          currencies: sc.rewards?.currencies ?? [],
        };
      }
      const items = gatherItems(c, 2, 1);
      return items.length
        ? { kind: 'items', items, message: '丁寧に調べて採取した。' }
        : { kind: 'nothing', message: '詳しく調べたが、何も見つからなかった。' };
    },
  },
};

/**
 * 行動を実行する（行動力消費・時間経過・入手の反映まで）。
 * 戦闘になった場合は outcome.kind === 'encounter' を返すので、画面側で戦闘を始める。
 */
export function performExploreAction(save, data, actionId, rng) {
  if (isInTown(save)) throw new GameError('in_town', '街の中では探索できません');
  const nodeId = currentNodeId(save);
  const node = data.get('locations', nodeId);
  const action = EXPLORE_ACTIONS[actionId];
  if (!action || !(node.actions ?? []).includes(actionId)) throw new GameError('no_action', 'ここではその行動はできません');
  const cost = data.balance.exploration.actions[actionId];
  if (save.exploration.actionPoints < cost.ap) {
    throw new GameError('not_enough_ap', `行動力が足りません（必要 ${cost.ap}）。街の宿屋で休むと回復します`);
  }
  if (action.mayBattle && aliveMembers(save, data).length === 0) {
    throw new GameError('party_down', 'パーティが全員倒れています。街の宿屋で休んでください');
  }

  const situation = situationAt(save, data, nodeId);
  const weather = data.find('weathers', situation.weatherId);
  const outcome = action.run({ save, data, rng, node, situation, weather });

  save.exploration.actionPoints -= cost.ap;
  for (const it of outcome.items ?? []) addItem(save, data, it.itemId, it.qty, it.quality, nodeId);
  for (const c of outcome.currencies ?? []) addCurrency(save, data, c.currencyId, c.qty);
  if (outcome.kind === 'secret') save.flags[outcome.flag] = true;
  const time = advanceTime(save, data, cost.time, rng);
  return { actionId, nodeId, outcome, time };
}

/**
 * コマンド式探索の開始。未解決カードがある間は次の行動を受け付けないため、
 * ダブルタップでも行動力・報酬が二重反映されない。
 */
export function startExploreCommand(save, data, actionId, rng) {
  if (save.exploration.pendingEvent) throw new GameError('pending_event', '先に現在の探索結果を確認してください');
  const result = performExploreAction(save, data, actionId, rng);
  save.exploration.pendingEvent = structuredClone(result);
  return result;
}

export function clearExploreEvent(save) {
  save.exploration.pendingEvent = null;
}

/** データ定義された小イベントの選択肢を、追加APなしで1回だけ解決する。 */
export function resolveExploreChoice(save, data, choiceId) {
  const pending = save.exploration.pendingEvent;
  if (pending?.outcome?.kind !== 'choice') throw new GameError('no_pending_choice', '選べる探索イベントがありません');
  const choice = pending.outcome.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new GameError('unknown_choice', 'その選択肢はありません');
  const items = (choice.rewards?.items ?? []).map((it) => ({ itemId: it.itemId, quality: it.quality ?? 'q1', qty: it.qty ?? 1 }));
  const currencies = choice.rewards?.currencies ?? [];
  for (const it of items) addItem(save, data, it.itemId, it.qty, it.quality, pending.nodeId);
  for (const currency of currencies) addCurrency(save, data, currency.currencyId, currency.qty);
  let outcome;
  if (choice.enemies?.length) outcome = { kind: 'encounter', enemies: choice.enemies, message: choice.message };
  else if (choice.optionalEncounterId) outcome = { kind: 'strongHint', optionalEncounterId: choice.optionalEncounterId, message: choice.message };
  else outcome = { kind: items.length || currencies.length ? 'items' : 'nothing', items, currencies, message: choice.message };
  pending.outcome = outcome;
  return outcome;
}
