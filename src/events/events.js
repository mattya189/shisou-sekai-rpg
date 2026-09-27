/**
 * イベント（events.json）。街の住民・酒場・街探索などで発生する。
 *
 *   trigger : 発生する場面（'residents' / 'tavern' / 'townExplore' …）
 *   nodeId  : 発生する街・地点
 *   when    : 出現条件（時間帯・天候・フラグ）
 *   weight  : 条件を満たすイベントの中での出やすさ
 *   once    : true なら一度しか起きない
 *   lines   : 表示する文章
 *   effects : 結果（EVENT_EFFECTS に登録された種類）
 *
 * 新しい結果の種類は EVENT_EFFECTS に追加する。
 */
import { GameError } from '../core/errors.js';
import { addItem, addCurrency } from '../progression/inventory.js';
import { matchesWhen } from '../exploration/when.js';
import { situationAt } from '../exploration/time.js';

export const EVENT_EFFECTS = {
  giveItem: {
    params: ['itemId', 'qty'],
    apply(save, data, e, eventId) {
      addItem(save, data, e.itemId, e.qty, e.quality ?? 'q1', eventId);
      const item = data.get('items', e.itemId);
      return `${item.name}${item.hasQuality ? `（${data.qualityName(e.quality ?? 'q1')}）` : ''}×${e.qty}を手に入れた`;
    },
  },
  giveCurrency: {
    params: ['currencyId', 'qty'],
    apply(save, data, e) {
      addCurrency(save, data, e.currencyId, e.qty);
      return `${data.get('currencies', e.currencyId).name}を${e.qty}手に入れた`;
    },
  },
  setFlag: {
    params: ['flag'],
    apply(save, data, e) {
      save.flags[e.flag] = true;
      return null;
    },
  },
};

export function availableEvents(save, data, trigger, nodeId) {
  const sit = situationAt(save, data, nodeId);
  return data
    .list('events')
    .filter((ev) => ev.trigger === trigger && (!ev.nodeId || ev.nodeId === nodeId))
    .filter((ev) => !(ev.once && save.events.seen[ev.id]))
    .filter((ev) => matchesWhen(ev.when, sit));
}

/**
 * 条件を満たすイベントを1つ抽選して実行する。
 * @returns {{ eventId: string, lines: string[], results: string[] } | null}
 */
export function triggerEvent(save, data, trigger, nodeId, rng) {
  const ev = rng.weighted(availableEvents(save, data, trigger, nodeId).map((e) => ({ ...e, weight: e.weight ?? 1 })));
  if (!ev) return null;
  return runEvent(save, data, ev.id);
}

export function runEvent(save, data, eventId) {
  const ev = data.get('events', eventId);
  if (ev.once && save.events.seen[ev.id]) throw new GameError('event_done', 'このイベントはもう起きました');
  const results = [];
  for (const e of ev.effects ?? []) {
    const text = EVENT_EFFECTS[e.type]?.apply(save, data, e, ev.id);
    if (text) results.push(text);
  }
  save.events.seen[ev.id] = (save.events.seen[ev.id] ?? 0) + 1;
  return { eventId: ev.id, lines: ev.lines ?? [], results };
}
