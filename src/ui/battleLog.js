/**
 * 戦闘ログ（エンジンが出すイベント）を画面用の文章にする。
 * エンジン側は文章を持たないので、言い回しはここだけで変えられる。
 */

const OUTCOME_TEXT = { won: '勝利！', lost: '全滅してしまった…', timeout: '時間切れ' };

/** 味方と同じ名前の敵には「敵の」を付けて区別する */
function displayName(battle, unit) {
  if (unit.side !== 'enemy') return unit.name;
  const clash = battle.units.some((u) => u.side === 'ally' && u.name === unit.name);
  return clash ? `敵の${unit.name}` : unit.name;
}

export function describeEvent(ev, battle, data) {
  const name = (id) => {
    const u = battle.units.find((x) => x.id === id);
    return u ? displayName(battle, u) : id;
  };
  const statusName = (id) => data.find('statuses', id)?.name ?? id;
  const markerName = (id) => data.find('markers', id)?.name ?? id;

  switch (ev.type) {
    case 'start': {
      const names = [...new Set(battle.units.filter((u) => u.side === 'enemy' && !u.isPart).map((u) => u.name.replace(/ [A-J]$/, '')))];
      return `${names.join('、')}が現れた！`;
    }
    case 'end':
      return OUTCOME_TEXT[ev.outcome] ?? ev.outcome;
    case 'chargeStart':
      return ev.message ?? `${name(ev.actorId)}は力をためている……`;
    case 'breakEnd':
      return `${name(ev.targetId)}のBREAKが解けた`;
    case 'gimmick':
      return ev.message ?? `${name(ev.targetId)}の様子が変わった`;
    case 'statusEnd':
      return `${name(ev.targetId)}の${statusName(ev.statusId)}が治った`;
    case 'statusTick': {
      const dmg = ev.results.find((r) => r.kind === 'damage');
      const down = ev.results.some((r) => r.kind === 'defeat');
      return `${name(ev.targetId)}は${statusName(ev.statusId)}で${dmg?.amount ?? 0}ダメージ${down ? '、倒れた' : ''}`;
    }
    case 'action':
      return describeAction(ev, battle, data, name, statusName, markerName);
    default:
      return null;
  }
}

function describeAction(ev, battle, data, name, statusName, markerName) {
  const actor = battle.units.find((u) => u.id === ev.actorId);
  const skillName = data.find('skills', ev.skillId)?.name ?? ev.skillId;
  const head = ev.charged ? `${name(actor.id)}の大技、${skillName}！` : ev.kind === 'skill' ? `${name(actor.id)}の${skillName}！` : `${name(actor.id)}の攻撃`;
  const parts = [];

  // 対象ごとにダメージをまとめる（多段は 70+70+70）
  const dmg = new Map();
  for (const r of ev.results) {
    if (r.kind === 'damage') dmg.set(r.targetId, [...(dmg.get(r.targetId) ?? []), r.amount]);
  }
  for (const [targetId, list] of dmg) parts.push(`${name(targetId)}に${list.join('+')}`);

  for (const r of ev.results) {
    if (r.kind === 'heal' && r.amount > 0) parts.push(`${name(r.targetId)}のHPが${r.amount}回復`);
    else if (r.kind === 'statusApplied') parts.push(`${name(r.targetId)}は${statusName(r.statusId)}になった`);
    else if (r.kind === 'statusRefreshed') parts.push(`${name(r.targetId)}の${statusName(r.statusId)}がのびた`);
    else if (r.kind === 'statusResisted') parts.push(r.immune ? `${name(r.targetId)}には${statusName(r.statusId)}が効かない` : `${name(r.targetId)}に${statusName(r.statusId)}は効かなかった`);
    else if (r.kind === 'markerChanged' && r.amount !== 0) parts.push(`${name(r.targetId)}の${markerName(r.markerId)} ${r.amount > 0 ? '+' : ''}${r.amount}（${r.value}）`);
    else if (r.kind === 'markerCollected') parts.push(`${markerName(r.markerId)}を${name(r.targetId)}へ集約（${r.value}）`);
    else if (r.kind === 'miss') parts.push(`${name(r.targetId)}は回避した`);
    else if (r.kind === 'break') parts.push(`${name(r.targetId)}をBREAKさせた！`);
    else if (r.kind === 'chargeCanceled') parts.push(`${name(r.targetId)}の大技を止めた！`);
    else if (r.kind === 'phase' || r.kind === 'partBroken') parts.push(r.message ?? `${name(r.targetId)}の様子が変わった`);
  }
  for (const r of ev.results) {
    if (r.kind !== 'defeat') continue;
    const target = battle.units.find((u) => u.id === r.targetId);
    if (target?.isPart) continue; // 部位は partBroken の文で伝える
    parts.push(target?.side === 'enemy' ? `${name(r.targetId)}を倒した` : `${name(r.targetId)}は倒れた`);
  }
  const text = parts.length ? `${head} ${parts.join('、')}` : head;
  return ev.skippedForMp?.length ? `${text}（MP不足で見送り: ${ev.skippedForMp.map((id) => data.find('skills', id)?.name ?? id).join('・')}）` : text;
}
