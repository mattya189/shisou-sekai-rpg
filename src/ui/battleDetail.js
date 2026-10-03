/**
 * 戦闘中の敵・味方の「詳細パネル」に出す内容を、戦闘状態から組み立てる。DOMに依存しない。
 *
 * - 値はすべて戦闘状態（battle.units）とデータ定義を読むだけで、表示側で戦闘計算をやり直さない。
 * - 能力値の実効値は engine と同じ effectiveStat / effectiveInterval を使う。
 * - 特技の次の条件到達は src/battle/forecast.js（engine と同じ条件判定）を使う。
 * - 取得できない項目は出さない。架空の数値は作らない。
 */
import { effectiveStat, effectiveInterval } from '../battle/engine.js';
import { skillForecast } from '../battle/forecast.js';
import { describeCondition } from '../battle/conditions.js';
import { describePassiveEffect, skillTriggerText } from '../codex/abilities.js';
import { markerPresentation } from './battlePresentation.js';

export const STAT_ROWS = [
  ['atk', '物理攻撃'],
  ['matk', '魔法攻撃'],
  ['def', '物理防御'],
  ['mdef', '魔法防御'],
  ['evasion', '回避率'],
];

function stripTemp(name) {
  return String(name ?? '').replace(/^（仮）/, '');
}

/**
 * 状態効果が対象にとって有利（buff）か不利（debuff）か。データの kind と params から決める。
 * @returns {'buff'|'debuff'|'neutral'}
 */
export function statusPolarity(def) {
  if (!def) return 'neutral';
  const p = def.params ?? {};
  switch (def.kind) {
    case 'damageOverTime':
    case 'attackDelay':
    case 'skipAction':
      return 'debuff';
    case 'healOverTime':
    case 'additionalNormalAttack':
      return 'buff';
    case 'statModifier':
    case 'flatStatModifier': {
      const v = def.kind === 'statModifier' ? p.pct : p.amount;
      return v > 0 ? 'buff' : v < 0 ? 'debuff' : 'neutral';
    }
    case 'multiStatModifier': {
      const total = Object.values(p.statPct ?? {}).reduce((n, v) => n + v, 0) - (p.intervalPct ?? 0);
      return total > 0 ? 'buff' : total < 0 ? 'debuff' : 'neutral';
    }
    case 'intervalPctModifier':
      // 攻撃間隔が短くなる（マイナス）ほど有利
      return p.pct < 0 ? 'buff' : p.pct > 0 ? 'debuff' : 'neutral';
    default:
      return 'neutral';
  }
}

/**
 * 残り期間の説明。ターン基準は「対象自身の行動で減る」ことを明示する。
 * @returns {{ short: string, long: string }}
 */
export function statusRemainingText(status, timeMs) {
  if (status.untilAttack) return { short: '次の攻撃', long: '次にダメージを与える攻撃全体の終了まで' };
  if (status.remainingTurns != null) {
    const n = status.remainingTurns;
    const timing = status.turnTiming === 'actionStart' ? '行動開始時' : '行動終了時';
    return { short: `${n}行動`, long: `残り${n}行動（このキャラが${n}回行動すると終了。${timing}に減る）` };
  }
  if (status.expiresAt != null) {
    const sec = Math.max(0, (status.expiresAt - timeMs) / 1000);
    const text = sec >= 10 ? `${Math.ceil(sec)}秒` : `${sec.toFixed(1)}秒`;
    return { short: text, long: `残り${text}（戦闘時間で減る）` };
  }
  return { short: '', long: '戦闘終了まで' };
}

function blockerText(blocker, data) {
  switch (blocker.code) {
    case 'down': return '戦闘不能のため発動しない';
    case 'used': return '使用済み（1戦闘1回）';
    case 'mp': return `現在MP不足（${blocker.mp}/${blocker.mpCost}）。到達時に足りなければ見送り`;
    case 'otherCondition': return 'ほかの条件を今は満たしていない';
    case 'priority': return `同じ回数で優先度の高い「${data.find('skills', blocker.skillId)?.name ?? blocker.skillId}」が先に判定される（発動すればこちらは見送り）`;
    default: return blocker.code;
  }
}

function forecastText(item, data, attackCount) {
  const skill = item.skill;
  if (item.category === 'attackCount') {
    if (item.nextAttackCount == null) return '条件到達の予定なし';
    const others = item.otherConditions.length ? `。ほかの条件：${item.otherConditions.map((c) => describeCondition(c, data)).join(' かつ ')}` : '';
    if (!item.countsAsAttack) {
      const now = item.nextAttackCount === attackCount ? '（現在）' : '';
      return `次の判定は攻撃回数${item.nextAttackCount}の時点${now}。非攻撃行動のため攻撃回数は増えない${others}`;
    }
    return `次の条件到達は攻撃${item.nextAttackCount}回目${others}`;
  }
  if (item.category === 'chance') return `行動ごとに${Math.round(item.chance * 100)}%で判定（攻撃回数とは無関係）`;
  if (item.category === 'immediate') return '条件が成立した瞬間に即時発動（ターン・攻撃回数を消費しない）';
  if (item.category === 'combo') return `「${data.find('skills', skill.comboFrom)?.name ?? skill.comboFrom}」の後に連携して発動`;
  if (item.category === 'condition') {
    if (item.otherConditionsMet === true) return '現在、条件を満たしている';
    if (item.otherConditionsMet === false) return '現在、条件を満たしていない';
    return '';
  }
  return '';
}

/** 1ユニットの詳細表示モデル */
export function unitDetailModel(unit, battle, data) {
  const timeMs = battle.timeMs;
  const isAlly = unit.side === 'ally';

  const stats = unit.isPart ? [] : STAT_ROWS
    .filter(([key]) => key !== 'evasion' || (unit.stats?.evasion ?? 0) > 0 || effectiveStat(unit, 'evasion') > 0)
    .map(([key, label]) => {
      const base = unit.stats?.[key] ?? (key === 'matk' ? unit.stats?.atk : key === 'mdef' ? unit.stats?.def : 0) ?? 0;
      const value = Math.round(effectiveStat(unit, key));
      return { key, label, value: key === 'evasion' ? `${value}%` : value, base: Math.round(base), changed: Math.round(base) !== value };
    });

  const interval = Number.isFinite(unit.stats?.attackIntervalMs) ? effectiveInterval(unit) : null;
  const timing = [];
  if (interval != null) {
    timing.push({ label: '行動間隔', value: `${(interval / 1000).toFixed(2)}秒` });
    if (unit.alive && Number.isFinite(unit.nextAttackAt)) {
      timing.push({ label: '次の行動まで', value: `${(Math.max(0, unit.nextAttackAt - timeMs) / 1000).toFixed(1)}秒` });
    }
  } else {
    timing.push({ label: '行動', value: '行動しない（部位）' });
  }

  const markers = Object.entries(unit.markers ?? {})
    .map(([markerId, state]) => {
      const def = data.find('markers', markerId);
      return { id: markerId, name: def?.name ?? markerId, value: state?.stacks ?? 0, max: def?.maxStacks ?? null, description: def?.description ?? '' };
    })
    .filter((m) => m.value > 0);

  const statuses = (unit.statuses ?? []).map((status) => {
    const def = data.find('statuses', status.statusId);
    return {
      id: status.statusId,
      name: stripTemp(def?.name ?? status.statusId),
      description: def?.description ?? '',
      polarity: statusPolarity(def),
      remaining: statusRemainingText(status, timeMs),
    };
  });

  const passiveMap = new Map();
  for (const p of unit.passives ?? []) {
    const def = data.find('passives', p.passiveId);
    const entry = passiveMap.get(p.passiveId) ?? { id: p.passiveId, name: stripTemp(def?.name ?? p.passiveId), effects: [] };
    entry.effects.push(describePassiveEffect(p.effect, data));
    passiveMap.set(p.passiveId, entry);
  }

  const skills = skillForecast(unit, battle, data).map((item) => ({
    id: item.skillId,
    name: item.skill?.name ?? item.skillId,
    mpCost: item.skill?.mpCost ?? 0,
    trigger: item.skill ? skillTriggerText(item.skill, data) : '',
    countsAsAttack: item.countsAsAttack,
    category: item.category,
    nextAttackCount: item.nextAttackCount,
    forecast: item.skill ? forecastText(item, data, unit.attackCount) : 'データが見つからない',
    blockers: item.blockers.map((b) => blockerText(b, data)),
    oncePerBattle: Boolean(item.skill?.oncePerBattle),
  }));

  const situation = [];
  if (!unit.alive) situation.push(isAlly ? '戦闘不能' : '撃破済み');
  if (unit.broken) situation.push('BREAK中（行動不能・被ダメージ増加）');
  if (unit.charging) situation.push('大技を準備中');
  if (unit.isPart && unit.partOfUnit) situation.push(`${unit.partOfUnit.name}の部位`);
  if (unit.boss?.partsDestroyed) situation.push(`部位破壊 ${unit.boss.partsDestroyed}`);
  if (unit.boss?.break) situation.push(`BREAKゲージ ${unit.boss.break.gauge}/${unit.boss.break.max}（BREAK ${unit.boss.break.count}回）`);
  for (const id of unit.usedSkills ?? []) situation.push(`${data.find('skills', id)?.name ?? id}：使用済み`);
  for (const pending of unit.pendingActionEffects ?? []) {
    situation.push(`${data.find('skills', pending.sourceSkillId)?.name ?? '予約効果'}：あと${pending.turnsLeft}行動後の行動開始時に完成`);
  }
  for (const pending of unit.pendingAttackEffects ?? []) {
    situation.push(`${data.find('skills', pending.comboSkillId)?.name ?? '連携'}：次の攻撃時に発動予約`);
  }
  for (const [resourceId, state] of Object.entries(unit.resources ?? {})) {
    if (state?.items?.length) situation.push(`${resourceId}：${state.items.join('・')}`);
  }

  return {
    id: unit.id,
    name: unit.name,
    sideLabel: isAlly ? '味方' : unit.boss ? 'ボス' : unit.isPart ? '敵（部位）' : '敵',
    level: unit.isPart ? null : unit.level ?? null,
    rank: isAlly && unit.rank != null ? unit.rank : null,
    alive: unit.alive,
    hp: unit.hp,
    maxHp: unit.maxHp,
    mp: unit.usesMp ? unit.mp : null,
    maxMp: unit.usesMp ? unit.maxMp : null,
    turnCount: unit.turnCount,
    attackCount: unit.attackCount,
    stats,
    timing,
    markers,
    statuses,
    passives: [...passiveMap.values()],
    skills,
    situation,
  };
}

/** 通常画面の状態アイコン（代表）。マーカー → 不利 → 有利 の順で、超過分は件数にまとめる。 */
export function compactBadges(unit, data, limit = 2) {
  const { visible, hidden } = markerPresentation(unit, data, 99);
  const markers = [...visible, ...hidden].map((m) => ({
    kind: 'marker', label: m.name, value: m.max != null ? `${m.value}` : `${m.value}`, isMax: m.isMax, title: `${m.name} ${m.value}${m.max != null ? `/${m.max}` : ''}`,
  }));
  const statuses = (unit.statuses ?? []).map((status) => {
    const def = data.find('statuses', status.statusId);
    const polarity = statusPolarity(def);
    const remaining = statusRemainingText(status, 0);
    return { kind: polarity, label: stripTemp(def?.name ?? status.statusId), value: status.remainingTurns != null ? remaining.short : '', title: stripTemp(def?.name ?? status.statusId) };
  }).sort((a, b) => (a.kind === 'debuff' ? 0 : 1) - (b.kind === 'debuff' ? 0 : 1));
  const all = [...markers, ...statuses];
  return { visible: all.slice(0, limit), hiddenCount: Math.max(0, all.length - limit) };
}

/**
 * 戦場の情報欄に出すスタックと状態。スタックは名前・現在値（上限は詳細パネル）で、画面側が決めた件数（空き欄に入る数）まで、
 * 状態は1行のチップにまとめる。どちらも上限を超えた分は件数にする。値は戦闘状態をそのまま読む。
 */
export function fieldStatusArea(unit, data, { stackLimit = 2, statusLimit = 3 } = {}) {
  const { visible, hidden } = markerPresentation(unit, data, 99);
  const stacks = [...visible, ...hidden].map((m) => ({
    id: m.id,
    name: m.name,
    value: m.value,
    max: m.max,
    isMax: m.isMax,
    pct: m.max ? Math.min(100, Math.round((m.value / m.max) * 100)) : null,
  }));
  const statuses = (unit.statuses ?? []).map((status) => {
    const def = data.find('statuses', status.statusId);
    const polarity = statusPolarity(def);
    return {
      kind: polarity,
      label: stripTemp(def?.name ?? status.statusId),
      value: status.remainingTurns != null ? statusRemainingText(status, 0).short : '',
    };
  }).sort((a, b) => (a.kind === 'debuff' ? 0 : 1) - (b.kind === 'debuff' ? 0 : 1));
  return {
    stacks: stacks.slice(0, stackLimit),
    hiddenStacks: Math.max(0, stacks.length - stackLimit),
    statuses: statuses.slice(0, statusLimit),
    hiddenStatuses: Math.max(0, statuses.length - statusLimit),
  };
}

/** 行動ログ1件の補足（攻撃回数・ターン）。describeEvent の文章は変えずに後ろへ添える。 */
export function logEventMeta(event) {
  if (event?.type !== 'action') return '';
  if (event.kind === 'interrupted') return '';
  const parts = [`${event.turnCount}行動目`];
  parts.push(event.countsAsAttack ? `攻撃${event.attackCount}回目` : `攻撃回数${event.attackCount}のまま`);
  return parts.join('・');
}
