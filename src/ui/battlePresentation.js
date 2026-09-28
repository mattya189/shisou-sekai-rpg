/**
 * 戦闘イベントを表示演出と戦績へ変換する純粋な層。
 * 戦闘エンジンや乱数へは一切作用しない。
 */

const RESULT_KINDS = new Set(['damage', 'heal', 'miss', 'markerChanged', 'statusApplied', 'statusRefreshed']);

export function skillPresentation(skill, event) {
  const configured = skill?.presentation ?? {};
  const ultimate = configured.tier === 'ultimate' || skill?.name?.startsWith('奥義：');
  const combo = configured.tier === 'combo' || Boolean(skill?.comboFrom) || event?.results?.some((r) => r.kind === 'attackComboTriggered');
  const tier = ultimate ? 'ultimate' : combo ? 'combo' : event?.kind === 'skill' || event?.kind === 'immediate' ? 'skill' : 'normal';

  let type = configured.type;
  if (!type) {
    const effects = [...(skill?.effects ?? []), ...(skill?.completionEffects ?? [])];
    if (effects.some((e) => e.type === 'heal')) type = 'heal';
    else if (effects.some((e) => e.type === 'addMarker')) type = 'marker';
    else if (effects.some((e) => e.type === 'applyStatus')) type = 'status';
    else if (effects.some((e) => e.damageType === 'magic')) type = 'projectile';
    else type = 'impact';
  }
  return { tier, type, label: skill?.name ?? '' };
}

/** 1ログイベントから表示すべき軽量エフェクトを列挙する。 */
export function presentationCues(event, battle, data) {
  if (!event) return [];
  if (event.type === 'statusTick') {
    return event.results.filter((r) => r.kind === 'damage').map((r) => ({ type: 'damage', targetId: r.targetId, amount: r.amount, dot: true }));
  }
  if (event.type !== 'action') return [];
  const skill = data.find('skills', event.skillId);
  const presentation = skillPresentation(skill, event);
  const cues = [{ ...presentation, presentationType: presentation.type, type: 'action', targetId: event.actorId, countsAsAttack: event.countsAsAttack, attackCount: event.attackCount }];
  if (event.skillId) cues.push({ ...presentation, presentationType: presentation.type, type: 'banner', targetId: event.actorId });

  for (const result of event.results ?? []) {
    if (!RESULT_KINDS.has(result.kind) && !['attackCountChanged', 'attackComboQueued', 'attackComboTriggered', 'defeat', 'break'].includes(result.kind)) continue;
    if (result.kind === 'damage') cues.push({
      type: 'damage',
      targetId: result.targetId,
      amount: result.amount,
      tier: presentation.tier,
      presentationType: presentation.type,
      elementId: result.element ?? skill?.element ?? null,
    });
    else if (result.kind === 'heal' && result.amount > 0) cues.push({ type: 'heal', targetId: result.targetId, amount: result.amount });
    else if (result.kind === 'miss') cues.push({ type: 'miss', targetId: result.targetId });
    else if (result.kind === 'markerChanged' && result.amount !== 0) cues.push({ type: 'marker', targetId: result.targetId, markerId: result.markerId, amount: result.amount, value: result.value });
    else if (result.kind === 'statusApplied' || result.kind === 'statusRefreshed') cues.push({ type: 'status', targetId: result.targetId, statusId: result.statusId });
    else if (result.kind === 'attackCountChanged') cues.push({ type: 'attackCount', targetId: result.targetId, amount: result.amount, value: result.value });
    else if (result.kind === 'attackComboQueued') cues.push({ type: 'comboQueued', targetId: result.targetId, skillId: result.comboSkillId });
    else if (result.kind === 'attackComboTriggered') cues.push({ type: 'combo', targetId: result.targetId, skillId: result.comboSkillId });
    else if (result.kind === 'defeat') cues.push({ type: 'defeat', targetId: result.targetId });
    else if (result.kind === 'break') cues.push({ type: 'break', targetId: result.targetId });
  }
  return cues;
}

/** 属性・効果種別から表示層だけで使う色と粒子形状を返す。 */
export function effectPresentation(cue, data) {
  if (cue.type === 'heal') return { particle: 'heal', color: '#82e897', accent: '#edfff1', sound: 'heal' };
  if (cue.type === 'marker') return { particle: 'marker', color: '#438dff', accent: '#d7ebff', sound: 'marker' };
  if (cue.type === 'status') return { particle: 'status', color: '#d47bd8', accent: '#ffe1ff', sound: 'status' };
  if (cue.type === 'break') return { particle: 'break', color: '#9ee7ff', accent: '#ffffff', sound: 'break' };
  const element = cue.elementId ? data.find('elements', cue.elementId) : null;
  return element?.presentation ?? { particle: 'neutral', color: '#f2f4ff', accent: '#aeb8dd', sound: 'impact' };
}

/**
 * 行動ごとの演出間隔。戦闘計算には影響せず、表示キューを読む速さだけを決める。
 * 高速設定でも平方根までしか短縮しないことで、特技名と結果が潰れないようにする。
 */
export function presentationDelayMs(speed, cues = []) {
  const tiers = new Set(cues.map((cue) => cue.tier));
  // 小さい画面でも技名・対象・結果を順番に追えるよう、旧設定の2倍を確保する。
  const base = tiers.has('ultimate') ? 1440 : tiers.has('combo') ? 1120 : tiers.has('skill') ? 880 : 560;
  return Math.round(base / Math.sqrt(Math.max(1, Number(speed) || 1)));
}

/** 戦闘ログから味方ごとの戦績を集計する。 */
export function buildBattleReport(battle) {
  const allies = battle.units.filter((u) => u.side === 'ally');
  const allyIds = new Set(allies.map((u) => u.id));
  const rows = new Map(allies.map((u) => [u.id, {
    unitId: u.id,
    name: u.name,
    damageDealt: 0,
    damageTaken: 0,
    healing: 0,
    normalAttacks: 0,
    skillUses: 0,
    comboTriggers: 0,
    markerGain: 0,
  }]));

  for (const event of battle.log) {
    if (event.type === 'statusTick') {
      if (allyIds.has(event.targetId)) rows.get(event.targetId).damageTaken += sum(event.results, 'damage');
      continue;
    }
    if (event.type !== 'action') continue;
    const actorRow = rows.get(event.actorId);
    if (actorRow) {
      if (event.kind === 'normal') actorRow.normalAttacks += 1;
      else if (event.skillId) actorRow.skillUses += 1;
      actorRow.damageDealt += (event.results ?? [])
        .filter((r) => r.kind === 'damage' && !allyIds.has(r.targetId))
        .reduce((n, r) => n + r.amount, 0);
      actorRow.healing += sum(event.results, 'heal');
      actorRow.comboTriggers += (event.results ?? []).filter((r) => r.kind === 'attackComboTriggered').length;
      actorRow.markerGain += (event.results ?? []).filter((r) => r.kind === 'markerChanged' && r.amount > 0).reduce((n, r) => n + r.amount, 0);
    }
    for (const result of event.results ?? []) {
      if (result.kind === 'damage' && allyIds.has(result.targetId)) rows.get(result.targetId).damageTaken += result.amount;
    }
  }
  return allies.map((u) => rows.get(u.id));
}

function sum(results = [], kind) {
  return results.filter((r) => r.kind === kind).reduce((n, r) => n + (r.amount ?? 0), 0);
}
