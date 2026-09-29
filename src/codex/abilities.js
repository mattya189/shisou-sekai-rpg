/**
 * 戦闘用の特技・パッシブデータから図鑑用の表示モデルを作る。
 * 数値や条件は data/*.json を直接参照し、図鑑専用の複製データを持たない。
 */
import { describeCondition } from '../battle/conditions.js';
import { monsterUnlockState } from './codex.js';

export const ABILITY_KIND_LABEL = {
  skill: '特技',
  passive: 'パッシブ',
  ultimate: '奥義',
  combo: 'コンボ',
};

const TARGET_LABEL = {
  enemySingle: '敵単体',
  enemyAll: '敵全体',
  self: '自分',
  allyLowestHp: 'HPが最も低い味方',
  allyAll: '味方全体',
  sourceAttacker: '攻撃してきた敵',
};

const STAT_LABEL = {
  hp: 'HP', mp: 'MP', atk: '攻撃力', def: '防御力', matk: '魔法攻撃', mdef: '魔法防御', evasion: '回避率',
};

function pct(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function nameOf(data, category, id) {
  return data.find(category, id)?.name ?? id;
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => walk(item, visit));
    else if (child && typeof child === 'object') walk(child, visit);
  }
}

function collectReferences(value, key) {
  const ids = new Set();
  walk(value, (node) => {
    if (typeof node[key] === 'string') ids.add(node[key]);
  });
  return [...ids];
}

function collectMarkerReferences(value) {
  const ids = new Set();
  walk(value, (node) => {
    for (const [key, id] of Object.entries(node)) {
      if (key.toLowerCase().endsWith('markerid') && typeof id === 'string') ids.add(id);
    }
  });
  return [...ids];
}

function attackMultiples(trigger) {
  const values = new Set();
  walk(trigger, (node) => {
    if (node.type === 'attackCountMultiple' && Number.isInteger(node.n)) values.add(node.n);
    if (node.type === 'attackCountEvery' && Number.isInteger(node.n)) values.add(node.n);
  });
  return [...values].sort((a, b) => a - b);
}

export function skillKind(skill) {
  if (skill.comboFrom) return 'combo';
  if (skill.name.startsWith('奥義：')) return 'ultimate';
  return 'skill';
}

export function skillTriggerText(skill, data) {
  if (skill.immediateTrigger) {
    const t = skill.immediateTrigger;
    if (t.type === 'markerThresholdReached') {
      return `${nameOf(data, 'markers', t.markerId)}が${t.thresholds.join('・')}に到達したとき即時`;
    }
    if (t.type === 'damaged') return `ダメージを受けたとき${Math.round(t.chance * 100)}%で即時`;
    return '条件成立時に即時発動';
  }
  if (skill.comboFrom) return `${nameOf(data, 'skills', skill.comboFrom)}から連携`;
  return describeCondition(skill.trigger, data);
}

export function skillActionCountText(skill) {
  if (skill.immediateTrigger) return '即時発動のため増えない（ターンも消費しない）';
  if (skill.comboFrom) return '追加発動のため増えない（独立したターンではない）';
  return skill.countsAsAttack === false ? '増えない（行動ターンは1進む）' : '増える（行動ターンも1進む）';
}

function skillUsers(data, skillId) {
  return data.list('monsters').flatMap((monster) => {
    const learn = monster.learnset?.find((entry) => entry.skillId === skillId);
    return learn ? [{ monsterId: monster.id, monster, rank: learn.rank ?? 1, level: learn.level ?? 1 }] : [];
  });
}

function passiveUsers(data, passiveId) {
  return data.list('monsters')
    .filter((monster) => monster.passives?.includes(passiveId))
    .map((monster) => ({ monsterId: monster.id, monster }));
}

export function abilityCatalog(data) {
  const skills = data.list('skills').map((ability) => ({
    id: ability.id,
    type: 'skill',
    kind: skillKind(ability),
    name: ability.name,
    ability,
    triggerText: skillTriggerText(ability, data),
    users: skillUsers(data, ability.id),
    elementId: ability.element ?? null,
    attackMultiples: attackMultiples(ability.trigger),
    relatedStatusIds: collectReferences([ability.effects, ability.completionEffects], 'statusId'),
    relatedMarkerIds: collectMarkerReferences([ability.trigger, ability.immediateTrigger, ability.effects, ability.completionEffects]),
  }));
  const passives = data.list('passives').map((ability) => ({
    id: ability.id,
    type: 'passive',
    kind: 'passive',
    name: ability.name,
    ability,
    triggerText: '常時・条件成立時',
    users: passiveUsers(data, ability.id),
    elementId: null,
    attackMultiples: [],
    relatedStatusIds: collectReferences(ability.effects, 'statusId'),
    relatedMarkerIds: collectMarkerReferences(ability.effects),
  }));
  return [...skills, ...passives];
}

export function abilityFilterOptions(data, catalog = abilityCatalog(data)) {
  const multiples = [...new Set(catalog.flatMap((entry) => entry.attackMultiples))].sort((a, b) => a - b);
  const elements = [...new Set(catalog.map((entry) => entry.elementId).filter(Boolean))]
    .map((id) => ({ id, name: nameOf(data, 'elements', id) }));
  return { multiples, elements };
}

export function filterAbilityCatalog(catalog, { query = '', kind = 'all', element = 'all', trigger = 'all' } = {}) {
  const q = query.trim().toLocaleLowerCase('ja');
  return catalog.filter((entry) => {
    if (q && !`${entry.name} ${entry.triggerText} ${entry.ability.description ?? ''}`.toLocaleLowerCase('ja').includes(q)) return false;
    if (kind !== 'all' && entry.kind !== kind) return false;
    if (element !== 'all' && entry.elementId !== element) return false;
    if (trigger.startsWith('attack:') && !entry.attackMultiples.includes(Number(trigger.slice(7)))) return false;
    if (trigger === 'immediate' && !entry.ability.immediateTrigger) return false;
    if (trigger === 'status' && entry.relatedStatusIds.length === 0) return false;
    if (trigger === 'marker' && entry.relatedMarkerIds.length === 0) return false;
    return true;
  });
}

function durationText(status) {
  if (status.durationTurns != null) {
    const timing = status.turnTiming === 'actionStart' ? '行動開始時' : '行動終了時';
    return `対象自身の行動${status.durationTurns}回（${timing}に処理）`;
  }
  if (status.durationMs != null) return `${status.durationMs / 1000}秒`;
  return null;
}

function damageText(effect, data, powerKey = 'power') {
  const type = effect.damageType === 'magic' ? '魔法攻撃' : '物理攻撃';
  const scaling = effect.scalingStat === 'maxHp' ? '最大HP依存' : effect.damageType === 'magic' ? '魔法攻撃力依存' : '物理攻撃力依存';
  const element = effect.element ? `${nameOf(data, 'elements', effect.element)}属性・` : '';
  const hits = effect.hits > 1 ? `×${effect.hits}回` : '';
  return `${TARGET_LABEL[effect.target] ?? '対象'}へ${element}${type} ${pct(effect[powerKey])}${hits}（${scaling}）`;
}

export function describeSkillEffect(effect, data) {
  switch (effect.type) {
    case 'damage': return damageText(effect, data);
    case 'heal': return `${TARGET_LABEL[effect.target]}を攻撃力依存${pct(effect.power)}で回復`;
    case 'healPctMax': return `${TARGET_LABEL[effect.target]}の最大HP${effect.pct}%を回復`;
    case 'applyStatus': return `${TARGET_LABEL[effect.target]}へ${nameOf(data, 'statuses', effect.statusId)}を付与${effect.chance != null ? `（基礎成功率${Math.round(effect.chance * 100)}%）` : ''}`;
    case 'markerScaledDamage': return `${TARGET_LABEL[effect.target]}へ${effect.damageType === 'magic' ? '魔法' : '物理'}攻撃 ${pct(effect.basePower)}＋${nameOf(data, 'markers', effect.markerId)}1ごとに${pct(effect.powerPerStack)}`;
    case 'markerThresholdDamage': return `${nameOf(data, 'markers', effect.markerId)}${effect.threshold}未満で${pct(effect.basePower)}、以上で${pct(effect.boostedPower)}の攻撃`;
    case 'addMarker': return `${TARGET_LABEL[effect.target]}の${nameOf(data, 'markers', effect.markerId)}を${effect.amount ?? `${effect.min}～${effect.max}`}増加`;
    case 'collectMarker': return `敵全体の${nameOf(data, 'markers', effect.markerId)}を最多の敵へ集約`;
    case 'scheduleEffects': return `${effect.afterTurns}行動後の行動開始時に予約効果を解決`;
    case 'conditionalEffects': return `${describeCondition(effect.condition, data)}の場合のみ追加効果`;
    case 'randomElementDamage': return `${TARGET_LABEL[effect.target]}へランダムな攻撃属性で${pct(effect.power)}の単発攻撃`;
    case 'allElementDamage': return `${TARGET_LABEL[effect.target]}ごとに最も有効な属性で${pct(effect.power)}の単発攻撃${effect.scalingStat === 'maxHp' ? '（最大HP依存）' : ''}`;
    case 'randomPowerDamage': return `${TARGET_LABEL[effect.target]}へ威力${effect.minPower}～${effect.maxPower}%のランダム攻撃`;
    case 'applyStatusBySpecies': return `${nameOf(data, 'species', effect.speciesId)}種族へ${nameOf(data, 'statuses', effect.statusId)}を付与（${effect.scope === 'all' ? '敵味方全体' : '対象範囲'}）`;
    case 'speciesScaledDamage': return `${pct(effect.basePower)}＋ほかの味方${nameOf(data, 'species', effect.speciesId)}1体につき${pct(effect.powerPerOtherAlly)}の攻撃`;
    case 'advanceAttackCountBySpecies': return `${nameOf(data, 'species', effect.speciesId)}の味方の攻撃回数を直接加算（その場で特技は再判定しない）`;
    case 'queueComboOnNextAttack': return '次の実際の攻撃直前にコンボを1回予約';
    case 'addRandomResource': return `${effect.resourceId}をランダムに${effect.count}個生成（上限${effect.max}）`;
    case 'addResourceItems': return `${effect.resourceId}へ指定資源を追加（上限${effect.max}）`;
    case 'consumeResource': return `${effect.resourceId}の指定資源を消費`;
    case 'armDoubleNextResource': return `次の${effect.resourceId}生成を1回だけ倍化`;
    case 'absorbMarkerToRandomResource': return `敵ごとに${nameOf(data, 'markers', effect.markerId)}を最大${effect.maxPerTarget}吸収し、合計${effect.per}ごとに${effect.resourceId}を生成`;
    case 'markerBandStatus': return `${nameOf(data, 'markers', effect.markerId)}の量に応じた状態を付与`;
    case 'removeOneDebuff': return `${TARGET_LABEL[effect.target]}の弱体効果を1つ解除`;
    case 'multiElementDamage': return `${TARGET_LABEL[effect.target]}へ${effect.elements.map((id) => nameOf(data, 'elements', id)).join('・')}属性で各${pct(effect.power)}`;
    case 'resourceMix': return `${effect.resourceId}から異なる2種類を消費し、組み合わせに応じた効果`;
    default: return effect.type;
  }
}

export function describePassiveEffect(effect, data) {
  switch (effect.type) {
    case 'statPerAttackCount': return `攻撃ごとに${STAT_LABEL[effect.stat] ?? effect.stat}+${effect.pctPerStack}%（最大${effect.maxStacks}回分）`;
    case 'normalAttackMpBonus': return `通常攻撃のMP回復を最大MPの${effect.pctOfMaxMp}%追加`;
    case 'healEveryNAttacks': return `${effect.n}回攻撃ごとに最大HPの${effect.pctOfMaxHp}%回復`;
    case 'damageVsStatus': return `${effect.statusId ? nameOf(data, 'statuses', effect.statusId) : '状態異常'}の敵へのダメージ+${effect.pct}%`;
    case 'flatStatPct': return `${STAT_LABEL[effect.stat] ?? effect.stat}+${effect.pct}%`;
    case 'normalAttackMarker': return `通常攻撃命中時、対象の${nameOf(data, 'markers', effect.markerId)}+${effect.amount}`;
    case 'consumeTargetMarkerOnHitGainSelfMarker': return `命中時、対象の${nameOf(data, 'markers', effect.targetMarkerId)}が${effect.required}以上なら${effect.consume}消費し、自分の${nameOf(data, 'markers', effect.selfMarkerId)}+${effect.gain}`;
    case 'chanceSelfMarkerOnPhysicalHit': return `物理攻撃命中時${Math.round(effect.chance * 100)}%で自分の${nameOf(data, 'markers', effect.markerId)}+${effect.amount}`;
    case 'markerGainToRandomResource': return `${nameOf(data, 'markers', effect.markerId)}の増加累計${effect.per}ごとに${effect.resourceId}をランダム生成（上限${effect.max}）`;
    default: return effect.type;
  }
}

export function abilityDetail(data, type, id) {
  const entry = abilityCatalog(data).find((item) => item.type === type && item.id === id);
  if (!entry) return null;
  const ability = entry.ability;
  const effects = type === 'skill'
    ? [...(ability.effects ?? []).map((effect) => describeSkillEffect(effect, data)), ...(ability.completionEffects ?? []).map((effect) => `連携時：${describeSkillEffect(effect, data)}`)]
    : (ability.effects ?? []).map((effect) => describePassiveEffect(effect, data));
  const statuses = entry.relatedStatusIds.map((statusId) => {
    const status = data.find('statuses', statusId);
    return status ? { ...status, durationText: durationText(status) } : null;
  }).filter(Boolean);
  const markers = entry.relatedMarkerIds.map((markerId) => data.find('markers', markerId)).filter(Boolean);
  return { ...entry, effects, statuses, markers };
}

export function abilityIsRevealed(save, data, entry) {
  return entry.users.some(({ monsterId }) => {
    const reveals = monsterUnlockState(save, data, monsterId).reveals;
    return reveals.has(entry.type === 'passive' ? 'passives' : 'skills');
  });
}
