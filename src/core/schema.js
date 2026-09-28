/**
 * データ検証の定義。
 *
 * 新しいカテゴリを追加するときは CATEGORY_SCHEMAS に1件追加し、
 * data/manifest.json にファイルを登録する。
 *
 *   prefix   : IDの接頭辞（例 "mon_" → mon_001）
 *   required : 必須項目
 *   refs     : [パス, 参照先カテゴリ] の一覧。"@node" は街または地点。
 *   check    : カテゴリ固有の追加チェック（任意）
 */
import { collectValues } from './paths.js';
import { validateCondition } from '../battle/conditions.js';
import { validateEffect } from '../battle/effects.js';
import { validatePassiveEffect } from '../battle/passives.js';
import { validateStatusDef } from '../battle/statusEffects.js';
import { validateEventTrigger } from '../battle/eventTriggers.js';
import { ITEM_USES } from '../progression/consumables.js';
import { EVENT_EFFECTS } from '../events/events.js';
import { BOSS_RECRUIT_CONDITIONS } from '../game/battleOutcome.js';

import { ID_PATTERN, ITEM_CATEGORIES, UNIT_STAT_KEYS, OPTIONAL_UNIT_STAT_KEYS, EQUIPMENT_STAT_KEYS, FLAG_PATTERN } from './constants.js';

export { ID_PATTERN, ITEM_CATEGORIES, UNIT_STAT_KEYS, OPTIONAL_UNIT_STAT_KEYS, EQUIPMENT_STAT_KEYS, FLAG_PATTERN };

/** 図鑑で段階的に開く情報の種類（src/ui/screens/monsterEntry.js で表示） */
export const CODEX_REVEALS = ['basic', 'habitat', 'stats', 'drops', 'skills', 'passives', 'recruit', 'description'];

/** when（出現条件）の検証: { periods: [...], weathers: [...], flags: [...], notFlags: [...] } */
function checkWhen(when, where, ctx) {
  if (!when) return;
  const periods = new Set((ctx.raw.balance?.time?.periods ?? []).map((p) => p.id));
  for (const p of when.periods ?? []) if (!periods.has(p)) ctx.error(`${where}.periods の "${p}" は balance.time.periods にありません`);
  for (const f of [...(when.flags ?? []), ...(when.notFlags ?? [])]) {
    if (!FLAG_PATTERN.test(f)) ctx.error(`${where} のフラグ "${f}" は flag_001 の形式にしてください`);
  }
}

function checkConnections(entry, ctx) {
  for (const c of entry.connections ?? []) {
    if (!(c.distance >= 0)) ctx.error(`connections の ${c.to} の distance は0以上にしてください`);
    for (const f of c.requires?.flags ?? []) {
      if (!FLAG_PATTERN.test(f)) ctx.error(`connections の ${c.to} の requires.flags "${f}" は flag_001 の形式にしてください`);
    }
  }
}

const unitRefs = [
  ['element', 'elements'],
  ['elementMultipliers{}', 'elements'],
  ['speciesIds[]', 'species'],
  ['learnset[].skillId', 'skills'],
  ['passives[]', 'passives'],
  ['duplicateTo[].itemId', 'items'],
];

function checkUnit(entry, ctx) {
  const { balance } = ctx.raw;
  for (const k of [...UNIT_STAT_KEYS, 'attackIntervalMs']) {
    if (typeof entry.baseStats?.[k] !== 'number') ctx.error(`baseStats.${k} は数値で指定してください`);
  }
  for (const k of OPTIONAL_UNIT_STAT_KEYS) {
    if (entry.baseStats?.[k] != null && typeof entry.baseStats[k] !== 'number') ctx.error(`baseStats.${k} は数値で指定してください`);
    if (entry.growth?.[k] != null && typeof entry.growth[k] !== 'number') ctx.error(`growth.${k} は数値で指定してください`);
  }
  if (!Array.isArray(entry.learnset)) return;
  if (balance && entry.learnset.length > balance.skills.maxLearned) {
    ctx.error(`習得特技が ${entry.learnset.length} 個あります（上限 ${balance.skills.maxLearned}）`);
  }
  if (balance && (entry.passives?.length ?? 0) > balance.passives.maxPerUnit) {
    ctx.error(`固有パッシブが ${entry.passives.length} 個あります（上限 ${balance.passives.maxPerUnit}）`);
  }
  for (const l of entry.learnset) {
    if (!Number.isInteger(l.level) || l.level < 1 || (balance && l.level > balance.levelCap)) {
      ctx.error(`learnset の ${l.skillId} の習得レベル ${l.level} が範囲外です`);
    }
    if (!Number.isInteger(l.rank ?? 1) || (l.rank ?? 1) < 1 || (l.rank ?? 1) > (balance?.ranks?.length ?? 5)) {
      ctx.error(`learnset の ${l.skillId} の習得ランク ${l.rank} が範囲外です`);
    }
  }
  const statusIds = new Set((ctx.raw.statuses ?? []).map((s) => s.id));
  for (const [statusId, resistance] of Object.entries(entry.statusResistances ?? {})) {
    if (statusId !== '*' && !statusIds.has(statusId)) ctx.error(`statusResistances の ${statusId} は存在しません`);
    if (!(resistance >= 0 && resistance <= 1)) ctx.error(`statusResistances.${statusId} は0〜1で指定してください`);
  }
}

export const CATEGORY_SCHEMAS = {
  elements: { prefix: 'elem_', required: ['id', 'name'] },
  species: { prefix: 'species_', required: ['id', 'name'] },
  markers: {
    prefix: 'marker_', required: ['id', 'name', 'maxStacks'],
    check(entry, ctx) {
      if (!Number.isInteger(entry.maxStacks) || entry.maxStacks < 1) ctx.error('maxStacks は正の整数にしてください');
    },
  },
  statuses: {
    prefix: 'status_',
    required: ['id', 'name', 'kind'],
    refs: [['params.markerId', 'markers']],
    check(entry, ctx) {
      validateStatusDef(entry).forEach((m) => ctx.error(m));
    },
  },
  weathers: { prefix: 'weather_', required: ['id', 'name'] },
  regions: {
    prefix: 'region_',
    required: ['id', 'name', 'weatherTable'],
    refs: [['worldId', 'worlds'], ['weatherTable[].weatherId', 'weathers']],
  },
  encounters: {
    prefix: 'enc_',
    required: ['id', 'entries'],
    refs: [['entries[].enemies[].defId', 'monsters'], ['entries[].when.weathers[]', 'weathers']],
    check(entry, ctx) {
      const max = ctx.raw.balance?.battle?.maxEnemies ?? 3;
      (entry.entries ?? []).forEach((e, i) => {
        if (!(e.weight > 0)) ctx.error(`entries[${i}].weight は正の数にしてください`);
        if (!e.enemies?.length || e.enemies.length > max) ctx.error(`entries[${i}].enemies は1〜${max}体にしてください`);
        for (const en of e.enemies ?? []) {
          const [lo, hi] = en.level ?? [];
          if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && lo <= hi)) ctx.error(`entries[${i}] の ${en.defId} の level は [最小, 最大] で指定してください`);
        }
        checkWhen(e.when, `entries[${i}].when`, ctx);
      });
    },
  },
  worlds: {
    prefix: 'world_',
    required: ['id', 'name', 'theme'],
    refs: [['startTownId', 'towns']],
  },
  towns: {
    prefix: 'town_',
    required: ['id', 'name', 'worldId', 'facilities'],
    refs: [['worldId', 'worlds'], ['region', 'regions'], ['connections[].to', '@node'], ['connections[].requires.items[]', 'items'], ['facilities[].shopId', 'shops']],
    check(entry, ctx) {
      checkConnections(entry, ctx);
      for (const f of entry.facilities ?? []) {
        if (!f.id || !f.type || !f.name) ctx.error(`施設には id / type / name が必要です: ${JSON.stringify(f)}`);
      }
    },
  },
  locations: {
    prefix: 'loc_',
    required: ['id', 'name', 'worldId', 'kind', 'region'],
    refs: [
      ['worldId', 'worlds'],
      ['region', 'regions'],
      ['connections[].to', '@node'],
      ['connections[].requires.items[]', 'items'],
      ['encounterTableId', 'encounters'],
      ['gathering[].itemId', 'items'],
      ['gathering[].when.weathers[]', 'weathers'],
      ['secrets[].rewards.items[].itemId', 'items'],
      ['secrets[].rewards.currencies[].currencyId', 'currencies'],
      ['dungeonId', 'dungeons'],
    ],
    check(entry, ctx) {
      checkConnections(entry, ctx);
      const known = Object.keys(ctx.raw.balance?.exploration?.actions ?? {});
      for (const a of entry.actions ?? []) {
        if (!known.includes(a)) ctx.error(`actions の "${a}" は balance.exploration.actions にありません`);
      }
      const needsTable = (entry.actions ?? []).some((a) => a === 'explore' || a === 'searchMonsters');
      if (needsTable && !entry.encounterTableId) ctx.error('探索・モンスター捜索ができる地点には encounterTableId が必要です');
      (entry.gathering ?? []).forEach((g, i) => checkWhen(g.when, `gathering[${i}].when`, ctx));
      (entry.secrets ?? []).forEach((sc, i) => {
        if (!FLAG_PATTERN.test(sc.flag ?? '')) ctx.error(`secrets[${i}].flag は flag_001 の形式にしてください`);
        checkWhen(sc.when, `secrets[${i}].when`, ctx);
      });
    },
  },
  characters: {
    prefix: 'chr_',
    required: ['id', 'name', 'element', 'baseStats', 'growth', 'learnset'],
    refs: unitRefs,
    check: checkUnit,
  },
  monsters: {
    prefix: 'mon_',
    required: ['id', 'name', 'worldId', 'element', 'baseStats', 'growth', 'learnset', 'recruit', 'drops'],
    refs: [
      ...unitRefs,
      ['worldId', 'worlds'],
      ['variantOf', 'monsters'],
      ['drops[].itemId', 'items'],
      ['recruit.duplicateTo[].itemId', 'items'],
    ],
    check(entry, ctx) {
      checkUnit(entry, ctx);
      const r = entry.recruit ?? {};
      if (!(r.baseRate >= 0 && r.baseRate <= 1)) ctx.error('recruit.baseRate は0〜1で指定してください');
      for (const d of entry.drops ?? []) {
        if (!(d.rate >= 0 && d.rate <= 1)) ctx.error(`drops の ${d.itemId} の rate は0〜1で指定してください`);
      }
    },
  },
  skills: {
    prefix: 'skill_',
    required: ['id', 'name', 'mpCost', 'trigger', 'effects'],
    refs: [
      ['element', 'elements'],
      ['effects[].statusId', 'statuses'],
      ['effects[].markerId', 'markers'],
      ['effects[].effects[].statusId', 'statuses'],
      ['effects[].effects[].markerId', 'markers'],
      ['effects[].speciesId', 'species'],
      ['effects[].effects[].speciesId', 'species'],
      ['effects[].condition.markerId', 'markers'],
      ['completionEffects[].statusId', 'statuses'],
      ['completionEffects[].markerId', 'markers'],
      ['trigger.statusId', 'statuses'],
      ['trigger.markerId', 'markers'],
      ['trigger.of[].statusId', 'statuses'],
      ['trigger.of[].markerId', 'markers'],
      ['immediateTrigger.markerId', 'markers'],
      ['comboFrom', 'skills'],
      ['targetSelector.markerId', 'markers'],
    ],
    check(entry, ctx) {
      if (entry.countsAsAttack != null && typeof entry.countsAsAttack !== 'boolean') {
        ctx.error('countsAsAttack は true または false で指定してください');
      }
      validateCondition(entry.trigger).forEach((m) => ctx.error(m));
      validateEventTrigger(entry.immediateTrigger).forEach((m) => ctx.error(m));
      if (!Array.isArray(entry.effects) || (!entry.comboFrom && entry.effects.length === 0)) ctx.error('effects を1つ以上指定してください');
      (entry.effects ?? []).forEach((e, i) => validateEffect(e, `effects[${i}]`).forEach((m) => ctx.error(m)));
      (entry.completionEffects ?? []).forEach((e, i) => validateEffect(e, `completionEffects[${i}]`).forEach((m) => ctx.error(m)));
      if (entry.comboFrom && !(entry.completionEffects?.length > 0)) ctx.error('コンボ特技には completionEffects が必要です');
      if (entry.oncePerBattle != null && typeof entry.oncePerBattle !== 'boolean') ctx.error('oncePerBattle は真偽値で指定してください');
      if (entry.targetSelector && entry.targetSelector.type !== 'enemyMarkerOldest') ctx.error(`targetSelector.type "${entry.targetSelector.type}" は未登録です`);
    },
  },
  passives: {
    prefix: 'passive_',
    required: ['id', 'name', 'description', 'effects'],
    refs: [
      ['effects[].statusId', 'statuses'], ['effects[].markerId', 'markers'],
      ['effects[].targetMarkerId', 'markers'], ['effects[].selfMarkerId', 'markers'],
    ],
    check(entry, ctx) {
      (entry.effects ?? []).forEach((e, i) => validatePassiveEffect(e, `effects[${i}]`).forEach((m) => ctx.error(m)));
    },
  },
  items: {
    prefix: 'item_',
    required: ['id', 'name', 'category', 'hasQuality'],
    check(entry, ctx) {
      if (!ITEM_CATEGORIES.includes(entry.category)) {
        ctx.error(`category "${entry.category}" は未登録です（${ITEM_CATEGORIES.join(', ')}）`);
      }
      if (entry.use) {
        const u = ITEM_USES[entry.use.type];
        if (!u) ctx.error(`use.type "${entry.use.type}" は未登録です（src/progression/consumables.js）`);
        else for (const p of u.params) if (entry.use[p] === undefined) ctx.error(`use には ${p} が必要です`);
      }
    },
  },
  equipment: {
    prefix: 'equip_',
    required: ['id', 'name', 'baseStats'],
    check(entry, ctx) {
      const keys = [
        ...Object.keys(entry.baseStats ?? {}),
        ...Object.keys(entry.enhancePerPlus ?? {}),
        ...(entry.randomStats?.pool ?? []).map((p) => p.stat),
      ];
      for (const k of keys) {
        if (!EQUIPMENT_STAT_KEYS.includes(k)) ctx.error(`装備の能力 "${k}" は未登録です（${EQUIPMENT_STAT_KEYS.join(', ')}）`);
      }
    },
  },
  currencies: { prefix: 'cur_', required: ['id', 'name'] },
  shops: {
    prefix: 'shop_',
    required: ['id', 'name'],
    refs: [['items[].itemId', 'items'], ['equipment[].defId', 'equipment']],
    check(entry, ctx) {
      for (const e of [...(entry.items ?? []), ...(entry.equipment ?? [])]) {
        if (!(e.price > 0)) ctx.error(`${e.itemId ?? e.defId} の price は正の数にしてください`);
        checkWhen(e.when, `${e.itemId ?? e.defId}.when`, ctx);
      }
    },
  },
  recipes: {
    prefix: 'recipe_',
    required: ['id', 'name', 'output', 'inputs'],
    refs: [['output.equipmentId', 'equipment'], ['output.itemId', 'items'], ['inputs[].itemId', 'items']],
    check(entry, ctx) {
      if (!entry.output?.equipmentId === !entry.output?.itemId) ctx.error('output には equipmentId か itemId のどちらか1つを書いてください');
      const qs = (ctx.raw.balance?.qualities ?? []).map((q) => q.id);
      for (const i of entry.inputs ?? []) if (i.minQuality && !qs.includes(i.minQuality)) ctx.error(`minQuality "${i.minQuality}" は存在しません`);
    },
  },
  events: {
    prefix: 'event_',
    required: ['id', 'trigger'],
    refs: [['nodeId', '@node'], ['effects[].itemId', 'items'], ['effects[].currencyId', 'currencies']],
    check(entry, ctx) {
      checkWhen(entry.when, 'when', ctx);
      (entry.effects ?? []).forEach((e, i) => {
        const def = EVENT_EFFECTS[e.type];
        if (!def) ctx.error(`effects[${i}].type "${e.type}" は未登録です（src/events/events.js）`);
        else for (const p of def.params) if (e[p] === undefined) ctx.error(`effects[${i}] には ${p} が必要です`);
        if (e.type === 'setFlag' && !FLAG_PATTERN.test(e.flag ?? '')) ctx.error(`effects[${i}].flag は flag_001 の形式にしてください`);
      });
    },
  },
  dungeons: {
    prefix: 'dgn_',
    required: ['id', 'name', 'entranceNodeId', 'stages'],
    refs: [['entranceNodeId', 'locations'], ['requires.items[]', 'items'], ['stages[].encounterTableId', 'encounters'], ['stages[].bossId', 'bosses']],
    check(entry, ctx) {
      (entry.stages ?? []).forEach((st, i) => {
        if (!st.encounterTableId === !st.bossId) ctx.error(`stages[${i}] には encounterTableId か bossId のどちらか1つを書いてください`);
      });
    },
  },
  bosses: {
    prefix: 'boss_',
    required: ['id', 'monsterId', 'level'],
    refs: [
      ['monsterId', 'monsters'],
      ['skills[]', 'skills'],
      ['statusImmune[]', 'statuses'],
      ['charge.skillId', 'skills'],
      ['phases[].skills[]', 'skills'],
      ['parts[].onDestroy.removeSkills[]', 'skills'],
      ['rewards.items[].itemId', 'items'],
    ],
    check(entry, ctx) {
      for (const c of entry.recruit?.conditions ?? []) {
        if (!BOSS_RECRUIT_CONDITIONS[c.type]) ctx.error(`recruit.conditions の "${c.type}" は未登録です（src/game/battleOutcome.js）`);
      }
      if (entry.defeatFlag && !FLAG_PATTERN.test(entry.defeatFlag)) ctx.error('defeatFlag は flag_001 の形式にしてください');
      if (entry.charge && !(entry.charge.everyNAttacks >= 1 && entry.charge.chargeMs >= 0)) ctx.error('charge には everyNAttacks と chargeMs が必要です');
      for (const p of entry.parts ?? []) if (!(p.hpPct > 0)) ctx.error(`parts の ${p.key} の hpPct は正の数にしてください`);
    },
  },
};

/**
 * @param {Record<string, any>} raw 読み込んだ全データ
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateGameData(raw) {
  const errors = [];
  const warnings = [];
  /** @type {Map<string, string>} */
  const allIds = new Map();
  /** @type {Record<string, Set<string>>} */
  const idSets = {};

  for (const [cat, schema] of Object.entries(CATEGORY_SCHEMAS)) {
    idSets[cat] = new Set();
    const list = raw[cat];
    if (!Array.isArray(list)) {
      errors.push(`カテゴリ ${cat} が読み込まれていません（data/manifest.json を確認）`);
      continue;
    }
    list.forEach((entry, i) => {
      const where = `${cat}[${i}]${entry?.id ? ` ${entry.id}` : ''}`;
      if (!entry || typeof entry !== 'object') {
        errors.push(`${where}: オブジェクトではありません`);
        return;
      }
      for (const f of schema.required) {
        if (entry[f] === undefined) errors.push(`${where}: 必須項目 ${f} がありません`);
      }
      if (typeof entry.id === 'string') {
        if (!entry.id.startsWith(schema.prefix) || !ID_PATTERN.test(entry.id)) {
          errors.push(`${where}: IDは ${schema.prefix}001 の形式にしてください`);
        }
        if (allIds.has(entry.id)) {
          errors.push(`${where}: ID ${entry.id} が重複しています（${allIds.get(entry.id)} にも存在）`);
        } else {
          allIds.set(entry.id, cat);
        }
        idSets[cat].add(entry.id);
      }
    });
  }

  const exists = (target, id) =>
    target === '@node' ? idSets.towns.has(id) || idSets.locations.has(id) : idSets[target]?.has(id);

  for (const [cat, schema] of Object.entries(CATEGORY_SCHEMAS)) {
    for (const entry of raw[cat] ?? []) {
      if (!entry || typeof entry !== 'object') continue;
      const where = `${cat} ${entry.id}`;
      for (const [path, target] of schema.refs ?? []) {
        for (const v of collectValues(entry, path)) {
          if (!exists(target, v)) errors.push(`${where}: ${path} が存在しないID "${v}" を参照しています`);
        }
      }
      schema.check?.(entry, {
        raw,
        error: (m) => errors.push(`${where}: ${m}`),
        warn: (m) => warnings.push(`${where}: ${m}`),
      });
    }
  }

  errors.push(...validateBalance(raw, exists));

  // 条件に使われているフラグが、どこかで立てられるか（立てる手段がないと永久に解放されない）
  const setFlags = new Set();
  for (const loc of raw.locations ?? []) for (const sc of loc.secrets ?? []) if (sc.flag) setFlags.add(sc.flag);
  for (const ev of raw.events ?? []) for (const e of ev.effects ?? []) if (e.type === 'setFlag') setFlags.add(e.flag);
  for (const bs of raw.bosses ?? []) if (bs.defeatFlag) setFlags.add(bs.defeatFlag);
  for (const node of [...(raw.towns ?? []), ...(raw.locations ?? [])]) {
    for (const c of node.connections ?? []) {
      for (const f of c.requires?.flags ?? []) {
        if (!setFlags.has(f)) warnings.push(`${node.id}: 接続 ${c.to} の解放フラグ ${f} を立てる手段がデータにありません`);
      }
    }
  }
  return { errors, warnings };
}

function validateBalance(raw, exists) {
  const b = raw.balance;
  if (!b) return ['balance.json が読み込まれていません'];
  const errors = [];
  const need = (cond, msg) => {
    if (!cond) errors.push(`balance: ${msg}`);
  };
  need(Array.isArray(b.ranks) && b.ranks.length > 0 && b.ranks[0].rank === 1, 'ranks は rank 1 から始めてください');
  need(Array.isArray(b.qualities) && b.qualities.length > 0, 'qualities がありません');
  need(b.party?.size === 4, 'party.size は4にしてください');
  need(b.skills?.maxLearned === 10, 'skills.maxLearned は10にしてください');
  need(b.skills?.maxEquipped === 5, 'skills.maxEquipped は5にしてください');
  need(b.passives?.maxPerUnit === 2, 'passives.maxPerUnit は2にしてください');
  need(b.equipment?.slots === 2, 'equipment.slots は2にしてください');
  need(b.qualities?.length === 5, 'qualities は5段階にしてください');
  const bt = b.battle ?? {};
  need(bt.defenseConstant > 0, 'battle.defenseConstant は正の数にしてください');
  need(bt.damageVariance >= 0 && bt.damageVariance < 1, 'battle.damageVariance は0以上1未満にしてください');
  need(bt.timeLimitMs > 0, 'battle.timeLimitMs は正の数にしてください');
  need(Array.isArray(bt.speeds) && bt.speeds.length > 0, 'battle.speeds を指定してください');
  need((b.qualities ?? []).every((q) => q.weight >= 0 && q.effectMultiplier > 0), 'qualities には weight と effectMultiplier が必要です');
  need(b.time?.ticksPerPeriod >= 1, 'time.ticksPerPeriod は1以上にしてください');
  for (const [id, a] of Object.entries(b.exploration?.actions ?? {})) {
    need(a.ap >= 0 && a.time >= 0, `exploration.actions.${id} には ap と time が必要です`);
  }
  need(b.inn?.cost >= 0, 'inn.cost を指定してください');
  need(b.recruit?.maxPerBattle >= 0, 'recruit.maxPerBattle を指定してください');
  need(exists('items', b.enhance?.costItemId), 'enhance.costItemId が存在しません');
  need(Array.isArray(b.enhance?.itemsPerPlus) && b.enhance.itemsPerPlus.length >= (b.equipment?.maxPlus ?? 0), 'enhance.itemsPerPlus は maxPlus 個以上にしてください');
  need(b.dungeon?.enterAp >= 0, 'dungeon.enterAp を指定してください');
  for (const st of b.codex?.monsterStages ?? []) {
    need(['codexFlag', 'counter', 'saveFlag'].includes(st.requires?.type), `codex.monsterStages の ${st.id} の requires.type が不正です`);
    for (const r of st.reveals ?? []) need(CODEX_REVEALS.includes(r), `codex.monsterStages の ${st.id} の reveals "${r}" は未登録です`);
  }
  need((b.codex?.monsterStages ?? []).some((st) => st.reveals?.includes('basic')), 'codex.monsterStages のどこかで basic を開いてください');
  need(exists('currencies', b.goldCurrencyId), `goldCurrencyId "${b.goldCurrencyId}" が存在しません`);
  for (const r of b.ranks ?? []) {
    for (const it of r.cost?.items ?? []) need(exists('items', it.itemId), `ランク${r.rank}の素材 ${it.itemId} が存在しません`);
  }
  const ng = b.newGame ?? {};
  need(exists('worlds', ng.worldId), `newGame.worldId "${ng.worldId}" が存在しません`);
  need(exists('towns', ng.townId), `newGame.townId "${ng.townId}" が存在しません`);
  const startUnits = new Set();
  for (const u of ng.units ?? []) {
    need(exists('characters', u.defId) || exists('monsters', u.defId), `newGame.units の ${u.defId} が存在しません`);
    startUnits.add(u.defId);
  }
  for (const p of ng.party ?? []) {
    if (p !== null) need(startUnits.has(p), `newGame.party の ${p} が newGame.units にありません`);
  }
  need((ng.party ?? []).length === b.party?.size, `newGame.party の長さは party.size (${b.party?.size}) にしてください`);
  const qualityIds = new Set((b.qualities ?? []).map((q) => q.id));
  for (const it of ng.items ?? []) {
    need(exists('items', it.itemId), `newGame.items の ${it.itemId} が存在しません`);
    need(qualityIds.has(it.quality ?? 'q1'), `newGame.items の品質 ${it.quality} が存在しません`);
  }
  for (const c of ng.currencies ?? []) need(exists('currencies', c.currencyId), `newGame.currencies の ${c.currencyId} が存在しません`);
  for (const e of ng.equipment ?? []) {
    need(exists('equipment', e.defId), `newGame.equipment の ${e.defId} が存在しません`);
    if (e.equipTo) need(startUnits.has(e.equipTo), `newGame.equipment の装備先 ${e.equipTo} が newGame.units にありません`);
  }
  return errors;
}
