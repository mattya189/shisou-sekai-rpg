/**
 * 宿屋で休む: 行動力を最大まで回復、全ユニットのHPを回復、翌日の朝になる。
 */
import { GameError } from '../core/errors.js';
import { spendCurrency, getCurrency } from '../progression/inventory.js';
import { healAllUnits } from '../progression/hp.js';
import { advanceToNextMorning } from '../exploration/time.js';
import { isInTown } from '../exploration/map.js';

export function restAtInn(save, data, rng) {
  if (!isInTown(save)) throw new GameError('not_in_town', '宿屋は街の中にあります');
  const cost = data.balance.inn.cost;
  const gold = data.balance.goldCurrencyId;
  if (getCurrency(save, gold) < cost) throw new GameError('not_enough_currency', `宿代（${cost}G）が足りません`);
  if (cost > 0) spendCurrency(save, data, gold, cost);
  save.exploration.actionPoints = save.exploration.maxActionPoints;
  healAllUnits(save);
  advanceToNextMorning(save, data, rng);
  return { cost };
}
