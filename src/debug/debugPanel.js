/**
 * 開発環境限定のデバッグパネル。
 * src/config.js の isDebugEnabled() が true のときだけ main.js から読み込まれる。
 *
 * 項目を追加するときは SECTIONS に1件追加する。
 * 各セクションは (ctx, api) => HTMLElement を返す。
 */
import { h } from '../ui/dom.js';
import { grantUnit, listOwnedUnits } from '../progression/units.js';
import { addItem, addCurrency } from '../progression/inventory.js';
import { grantEquipment } from '../progression/equipment.js';
import { setLevel, setRank, maxRank } from '../progression/leveling.js';
import { healAllUnits } from '../progression/hp.js';
import { rollAllWeather } from '../exploration/time.js';
import { markMonster, countMonster, recordItem } from '../progression/codex.js';

function select(options, value) {
  return h(
    'select',
    { class: 'dbg-input' },
    options.map((o) => h('option', { value: o.value, selected: o.value === value ? true : undefined }, o.label)),
  );
}

function num(value, min, max) {
  return h('input', { class: 'dbg-input dbg-num', type: 'number', inputmode: 'numeric', value, min, max });
}

function row(...children) {
  return h('div', { class: 'dbg-row' }, children);
}

function section(title, ...children) {
  return h('fieldset', { class: 'dbg-section' }, h('legend', {}, title), children);
}

const SECTIONS = [
  function units(ctx) {
    const { data, save } = ctx;
    const defs = [...data.list('characters'), ...data.list('monsters')];
    const sel = select(defs.map((d) => ({ value: d.id, label: `${d.id} ${d.name}` })));
    return section(
      'ユニット取得',
      row(sel),
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () =>
              ctx.act(
                () => grantUnit(save, data, sel.value),
                (r) => (r.status === 'added' ? `${sel.value} を入手しました` : `${sel.value} は所持済み。素材に変換しました`),
              ),
          },
          '取得',
        ),
      ),
    );
  },

  function items(ctx) {
    const { data, save } = ctx;
    const itemSel = select(data.list('items').map((i) => ({ value: i.id, label: `${i.id} ${i.name}` })));
    const qSel = select(data.balance.qualities.map((q) => ({ value: q.id, label: q.name })));
    const qty = num(10, 1, 99999);
    return section(
      'アイテム取得',
      row(itemSel),
      row(qSel, qty),
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () => ctx.act(() => addItem(save, data, itemSel.value, Number(qty.value), qSel.value), 'アイテムを追加しました'),
          },
          '取得',
        ),
      ),
    );
  },

  function equipment(ctx) {
    const { data, save, session } = ctx;
    const sel = select(data.list('equipment').map((e) => ({ value: e.id, label: `${e.id} ${e.name}` })));
    return section(
      '装備取得',
      row(sel),
      row(
        h(
          'button',
          { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => grantEquipment(save, data, sel.value, session.rng), '装備を追加しました') },
          '取得',
        ),
      ),
    );
  },

  function currencies(ctx) {
    const { data, save } = ctx;
    const sel = select(data.list('currencies').map((c) => ({ value: c.id, label: `${c.id} ${c.name}` })));
    const qty = num(1000, 1, 9999999);
    return section(
      '通貨取得',
      row(sel, qty),
      row(h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => addCurrency(save, data, sel.value, Number(qty.value)), '通貨を追加しました') }, '取得')),
    );
  },

  function levelRank(ctx) {
    const { data, save } = ctx;
    const owned = listOwnedUnits(save, data);
    if (!owned.length) return section('レベル・ランク', h('p', {}, 'ユニットがいません'));
    const sel = select(owned.map((u) => ({ value: u.unitId, label: `${u.unitId} ${u.def.name}（Lv.${u.unit.level} R${u.unit.rank}）` })));
    const lv = num(10, 1, data.balance.levelCap);
    const rk = num(1, 1, maxRank(data.balance));
    return section(
      'レベル・ランク変更',
      row(sel),
      row(
        h('label', { class: 'dbg-label' }, 'Lv', lv),
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => setLevel(save, data, sel.value, Number(lv.value)), 'レベルを変更しました') }, '設定'),
      ),
      row(
        h('label', { class: 'dbg-label' }, 'ランク', rk),
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => setRank(save, data, sel.value, Number(rk.value)), 'ランクを変更しました') }, '設定'),
      ),
    );
  },

  function recovery(ctx) {
    const { save } = ctx;
    return section(
      'スタミナ・HP',
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () =>
              ctx.act(() => {
                save.exploration.actionPoints = save.exploration.maxActionPoints;
              }, 'スタミナを回復しました'),
          },
          'スタミナを全回復',
        ),
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => healAllUnits(save), 'HPを全回復しました') }, 'HPを全回復'),
      ),
    );
  },

  function timeWeather(ctx) {
    const { data, save, session } = ctx;
    const t = save.exploration.time;
    const day = num(t.day, 1, 9999);
    const period = select(data.balance.time.periods.map((p) => ({ value: p.id, label: p.name })), t.period);
    const weatherSelects = data.list('regions').map((r) => ({
      region: r,
      sel: select(data.list('weathers').map((w) => ({ value: w.id, label: w.name })), save.exploration.weather[r.id]),
    }));
    return section(
      '時間・天候',
      row(h('label', { class: 'dbg-label' }, '日', day), period),
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () =>
              ctx.act(() => {
                t.day = Math.max(1, Number(day.value) || 1);
                t.period = period.value;
                t.tick = 0;
              }, '時間を変更しました'),
          },
          '時間を設定',
        ),
      ),
      weatherSelects.map((w) => row(h('span', { class: 'dbg-label' }, w.region.name), w.sel)),
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () =>
              ctx.act(() => {
                for (const w of weatherSelects) save.exploration.weather[w.region.id] = w.sel.value;
              }, '天候を変更しました'),
          },
          '天候を設定',
        ),
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => rollAllWeather(save, data, session.rng), '天候を抽選しました') }, '抽選し直す'),
      ),
    );
  },

  function nodesFlags(ctx) {
    const { data, save } = ctx;
    const flagInput = h('input', { class: 'dbg-input', type: 'text', placeholder: 'flag_001', autocapitalize: 'off' });
    const allFlags = [...new Set(data.list('locations').flatMap((l) => (l.secrets ?? []).map((sc) => sc.flag)))];
    return section(
      '地点・フラグ',
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () =>
              ctx.act(() => {
                for (const f of allFlags) save.flags[f] = true;
                const nodes = [...data.list('towns'), ...data.list('locations')].map((n) => n.id);
                save.exploration.discoveredNodes = [...new Set([...save.exploration.discoveredNodes, ...nodes])];
              }, 'すべての地点を解放しました'),
          },
          'すべての地点を解放',
        ),
      ),
      row(flagInput),
      row(
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => { if (flagInput.value) save.flags[flagInput.value.trim()] = true; }, 'フラグを立てました') }, 'フラグを立てる'),
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.act(() => { delete save.flags[flagInput.value.trim()]; }, 'フラグを消しました') }, '消す'),
      ),
      h('p', { class: 'dbg-note' }, `立っているフラグ: ${Object.keys(save.flags).filter((k) => save.flags[k]).join(', ') || 'なし'}`),
    );
  },

  function battle(ctx, api) {
    const { data } = ctx;
    const max = data.balance.battle.maxEnemies;
    const monsterOptions = data.list('monsters').map((m) => ({ value: m.id, label: `${m.id} ${m.name}` }));
    const rows = [];
    for (let i = 0; i < max; i++) {
      const sel = select(i === 0 ? monsterOptions : [{ value: '', label: 'なし' }, ...monsterOptions], i === 0 ? monsterOptions[0]?.value : '');
      const lv = num(3, 1, data.balance.levelCap);
      rows.push({ sel, lv });
    }
    const seed = h('input', { class: 'dbg-input', type: 'number', inputmode: 'numeric', placeholder: '空欄でランダム' });
    return section(
      '任意の戦闘',
      rows.map((r, i) => row(h('span', { class: 'dbg-label' }, `敵${i + 1}`), r.sel, h('label', { class: 'dbg-label' }, 'Lv', r.lv))),
      row(h('label', { class: 'dbg-label' }, 'seed'), seed),
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () => {
              const enemies = rows.filter((r) => r.sel.value).map((r) => ({ defId: r.sel.value, level: Number(r.lv.value) || 1 }));
              api.close();
              ctx.go('battle', { enemies, mode: 'field', source: 'debug', seed: seed.value ? Number(seed.value) : undefined });
            },
          },
          '戦闘開始（編成中のパーティ）',
        ),
      ),
    );
  },

  function codexAll(ctx) {
    const { data, save } = ctx;
    return section(
      '図鑑',
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () =>
              ctx.act(() => {
                for (const m of data.list('monsters')) {
                  for (const f of ['encountered', 'defeated', 'recruited']) markMonster(save, m.id, f);
                  countMonster(save, m.id, 'defeated', 5);
                }
                for (const it of data.list('items')) for (const q of data.qualityIds()) recordItem(save, it.id, q);
              }, '図鑑をすべて開放しました（仲間にはなりません）'),
          },
          '図鑑をすべて開放',
        ),
      ),
    );
  },

  function bossBattle(ctx, api) {
    const { data } = ctx;
    const sel = select(data.list('bosses').map((b) => ({ value: b.id, label: `${b.id} ${b.name}` })));
    const lv = num(data.list('bosses')[0]?.level ?? 10, 1, data.balance.levelCap);
    return section(
      'ボス戦',
      row(sel, h('label', { class: 'dbg-label' }, 'Lv', lv)),
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () => {
              api.close();
              ctx.go('battle', { enemies: [{ bossId: sel.value, level: Number(lv.value) || undefined }], mode: 'dungeon', source: 'debug' });
            },
          },
          'ボス戦を開始',
        ),
      ),
      h('p', { class: 'dbg-note' }, 'ダンジョンに入るには「アイテム取得」で遺跡の鍵（item_010）を取得し、遺跡の入口（地点解放）へ。'),
    );
  },

  function saveData(ctx, api) {
    const { session } = ctx;
    const area = h('textarea', { class: 'dbg-textarea', rows: 8, spellcheck: 'false' }, session.repo.exportText(session.save));
    return section(
      'セーブデータ',
      area,
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(area.value);
                ctx.toast('コピーしました');
              } catch {
                area.select();
                ctx.toast('選択しました。手動でコピーしてください');
              }
            },
          },
          'コピー',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onClick: () => {
              try {
                session.save = session.repo.parse(area.value);
                session.commit();
                api.close();
                ctx.go('town', {}, { reset: true });
                ctx.toast('セーブを読み込みました');
              } catch (e) {
                ctx.toast(e.message, 'error');
              }
            },
          },
          '書き換えて読み込む',
        ),
      ),
      row(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small btn-danger',
            onClick: () => {
              if (!window.confirm('セーブを初期化してタイトルに戻ります。よろしいですか？')) return;
              session.resetSave();
              api.close();
              ctx.go('title', {}, { reset: true });
            },
          },
          'セーブ初期化',
        ),
      ),
    );
  },
];

export function mountDebugPanel(ctx) {
  const sheet = h('div', { class: 'dbg-sheet', hidden: true, role: 'dialog', 'aria-label': 'デバッグ' });
  const api = {
    open() {
      const body = ctx.session.save
        ? SECTIONS.map((s) => s(ctx, api))
        : [h('p', { class: 'dbg-note' }, 'ゲームを開始するとデバッグ項目が表示されます。')];
      sheet.replaceChildren(
        h('div', { class: 'dbg-head' }, h('strong', {}, 'デバッグ（開発環境のみ）'), h('button', { type: 'button', class: 'btn btn-small', onClick: () => api.close() }, '閉じる')),
        h('div', { class: 'dbg-body' }, body),
      );
      sheet.hidden = false;
    },
    close() {
      sheet.hidden = true;
    },
  };
  const toggle = h('button', { type: 'button', class: 'dbg-toggle', 'aria-label': 'デバッグを開く', onClick: () => (sheet.hidden ? api.open() : api.close()) }, 'DBG');
  document.body.append(toggle, sheet);
  return api;
}
