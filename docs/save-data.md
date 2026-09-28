# セーブデータ

## 保存先

ブラウザの `localStorage`、キー `shisou-sekai-rpg/save`（`src/config.js` の `saveKey`）。
中身はJSON文字列です。開発環境ではデバッグパネルの「セーブデータ」で確認・書き換え・初期化ができます。

保存先は `src/save/storageAdapters.js` のアダプタで差し替えられます（`getItem` / `setItem` / `removeItem` の3つを持つオブジェクト）。
将来オンライン保存にする場合は、同じ形のアダプタを作って `src/main.js` で渡します。

## 構造（saveVersion 1）

```jsonc
{
  "saveVersion": 1,
  "createdAt": "2026-09-27T00:00:00.000Z",
  "updatedAt": "2026-09-27T00:10:00.000Z",
  "nextUid": 3,                        // 装備個体などの通し番号
  "units": {                           // 所持ユニット。キー＝ユニット定義ID（同種1体）
    "chr_001": {
      "defId": "chr_001",
      "kind": "character",             // character / monster
      "level": 3, "exp": 0, "rank": 1,
      "currentHp": null,               // フィールドの現在HP。null は満タン
      "equippedSkills": ["skill_001", "skill_002"],  // 並び順＝優先順位
      "extraSkills": [],               // レベル以外で覚えた特技（将来用）
      "equipment": ["eq_1", null]      // 装備個体のuid
    }
  },
  "party": ["chr_001", "chr_002", "mon_001", null],
  "inventory": {
    "items": { "item_001": { "q1": 3, "q2": 1 } },   // 品質別の数量
    "equipment": {
      "eq_1": { "uid": "eq_1", "defId": "equip_001", "plus": 0, "randomStats": [ { "stat": "hp", "value": 8 } ] }
    },
    "currencies": { "cur_001": 500 }
  },
  "codex": {
    "monsters": { "mon_001": { "flags": { "encountered": true, "recruited": true }, "counts": {} } },
    "items": { "item_001": { "qualities": { "q1": true, "q2": true }, "sources": { "loc_001": true, "mon_001": true } } }
  },
  "exploration": {
    "worldId": "world_001", "townId": "town_001", "locationId": null,
    "discoveredNodes": ["town_001"],
    "actionPoints": 6, "maxActionPoints": 6,
    "time": { "day": 1, "period": "morning", "tick": 0 },
    "weather": { "region_001": "weather_002" }
  },
  "recruit": { "failCounts": { "mon_002": 2 } },   // 種類ごとの加入失敗回数
  "flags": { "flag_002": true },     // 隠し要素・解放条件などの進行
  "events": { "seen": { "event_002": 1 } },            // イベントの発生回数（once の判定）
  "dungeonRun": { "dungeonId": "dgn_001", "stage": 1, "mp": { "chr_001": 30 } },  // 進行中のダンジョン（なければ null）
  "dungeons": { "cleared": { "dgn_001": 1 } },          // 踏破回数
  "settings": {
    "battleSpeed": 1,                  // 戦闘速度（前回の選択を覚える）
    "battleSoundEnabled": true,        // 戦闘効果音のミュート設定
    "battleSoundVolume": 0.45          // 戦闘効果音量（0～1）
  }
}
```

セーブには**IDだけ**を保存し、名前や能力値などの定義はデータから引きます。
そのため、データ側で名前や数値を変えても既存のセーブはそのまま使えます。

## 読み込みの流れ（`SaveRepository.load`）

1. JSONとして読む → 読めなければ `SaveLoadError`（タイトル画面で「セーブを退避して最初から」を案内）
2. `migrateSave`: `saveVersion` を見て、現在のバージョンまで順番に変換
   - `saveVersion` が無いセーブは v0 扱い
   - ゲームより新しいバージョンのセーブは読み込まない（古いゲームで上書きして壊さないため）
3. `normalizeSave`: 欠けている項目を `createEmptySave()` の初期値で補い、配列・オブジェクトの型が壊れた既知項目を安全な既定値へ戻す。**知らない項目は消さずに残す**

退避したセーブはキー `shisou-sekai-rpg/save/broken-backup` に残ります。

## 項目を変更するときの手順

### 新しい項目を追加するだけの場合（バージョンは上げない）

`src/save/saveSchema.js` の `createEmptySave()`（ユニットごとの項目なら `createUnitDefaults()`）に初期値を書きます。
古いセーブを読むと自動で補完されます。

### 既存の項目の形・意味を変える場合（バージョンを上げる）

1. `src/save/saveSchema.js` の `CURRENT_SAVE_VERSION` を +1
2. `src/save/migrations.js` の `MIGRATIONS` に変換を追加

```js
{
  from: 1,
  to: 2,
  description: '所持品の数量を品質別に分ける',
  migrate(save) {
    // save を新しい形に変換して返す
    return save;
  },
},
```

3. `tests/save/save.test.js` に、旧形式のセーブが正しく変換されるテストを追加
4. このファイルの「構造」を更新

### コンテンツを削除した場合

セーブに残ったIDがデータに無くても落ちないようになっています（例: 所持ユニット一覧ではデータに無いユニットを表示しない）。
ただし、**IDの再利用は禁止**です（別のものとして読まれてしまうため）。
