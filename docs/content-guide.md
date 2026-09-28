# コンテンツ追加ガイド

新しいコンテンツは **`data/` のJSONに1件追加するだけ**で登場するように作っています。
コードの変更が必要なのは「新しい**種類**の仕組み」（新しい発動条件、新しい効果など）を足すときだけです。

## 共通の手順

1. 追加先のファイルを開き、既存のサンプルをコピーする（各ファイルにサンプルがあります）
2. **新しいID**を付ける。そのカテゴリの最大番号 +1（例: `mon_005` の次は `mon_006`）
3. 中身を書き換える
4. `npm run check` を実行し、エラーが無いことを確認する
5. `npm start` で画面を確認する（デバッグパネルの「ユニット取得」「アイテム取得」が便利）

### IDのルール

| カテゴリ | ファイル | 接頭辞 |
|---|---|---|
| 思想世界 | `worlds.json` | `world_` |
| 街 | `towns.json` | `town_` |
| 地点 | `locations.json` | `loc_` |
| 人間キャラクター | `characters.json` | `chr_` |
| モンスター | `monsters.json` | `mon_` |
| 特技 | `skills.json` | `skill_` |
| 固有パッシブ | `passives.json` | `passive_` |
| アイテム | `items.json` | `item_` |
| 装備 | `equipment.json` | `equip_` |
| 通貨 | `currencies.json` | `cur_` |
| 属性 | `elements.json` | `elem_` |
| 種族タグ | `species.json` | `species_` |
| 蓄積マーカー | `markers.json` | `marker_` |
| 状態異常 | `statuses.json` | `status_` |
| 天候 | `weathers.json` | `weather_` |
| 地域 | `regions.json` | `region_` |
| エンカウントテーブル | `encounters.json` | `enc_` |
| ショップ | `shops.json` | `shop_` |
| 製作レシピ | `recipes.json` | `recipe_` |
| イベント | `events.json` | `event_` |
| ダンジョン | `dungeons.json` | `dgn_` |
| ボス | `bosses.json` | `boss_` |
| フラグ（進行管理） | セーブの `flags`。データでは secrets・requires・when で使う | `flag_` |
| 街の施設（街データ内） | `towns.json` の `facilities` | `fac_` |

- 形式は `接頭辞_数字3桁以上`。**表示名をIDにしない**。
- **一度使ったIDは変更・再利用しない**（セーブデータが参照しているため）。コンテンツを廃止するときも、IDは欠番にする。
- 表示名（`name`）はいつでも変えてよい。
- カテゴリをまたいでもIDは重複不可（検証で検出されます）。

### ファイルを分けたいとき

`data/manifest.json` の配列にファイルを追加すると、同じカテゴリとして結合して読み込みます。
世界が増えたら世界ごとに分けると管理しやすくなります。

```json
"monsters": ["monsters.json", "world_002/monsters.json"]
```

---

## 人間キャラクターを追加する（`characters.json`）

サンプル: `chr_001`（攻撃寄り）, `chr_002`（回復寄り）

```json
{
  "id": "chr_003",
  "name": "（仮）新しいキャラ",
  "description": "説明文。",
  "image": null,
  "element": "elem_001",
  "baseStats": { "hp": 150, "mp": 50, "atk": 20, "def": 12, "attackIntervalMs": 2200 },
  "growth": { "hp": 15, "mp": 4, "atk": 2.0, "def": 1.2 },
  "elementMultipliers": {},
  "learnset": [
    { "skillId": "skill_001", "level": 1 },
    { "skillId": "skill_003", "level": 10 }
  ],
  "passives": ["passive_002"],
  "duplicateTo": []
}
```

| 項目 | 意味 |
|---|---|
| `image` | 画像パス（例 `img/chr/chr_003.png`）。`null` なら自動で仮画像。正式モンスター画像は実透過PNGを原則とする |
| `baseStats` | Lv1・ランク1の能力値。`attackIntervalMs` は攻撃間隔（ミリ秒） |
| `growth` | 1レベルごとの上昇量（小数可。表示時に切り捨て） |
| `elementMultipliers` | 受けるダメージの属性倍率。`{ "elem_002": 1.5 }` なら火に弱い |
| `speciesIds` | 種族タグIDの配列。種族条件は表示名ではなくこのIDを参照する |
| `learnset` | 習得する特技と習得条件。`rank`（省略時1）と `level` の両方を満たすと習得。**最大10個**（`balance.skills.maxLearned`） |
| `passives` | 固有パッシブ。**1〜2個** |
| `duplicateTo` | 所持済みで再入手したときに変換される素材（任意） |

人間キャラクターの入手方法は未確定です（現在は開始時とデバッグのみ）。

## モンスターを追加する（`monsters.json`）

サンプル: `mon_001`（通常）, `mon_002`（高速）, `mon_003`（状態異常）, `mon_004`（硬い）, `mon_005`（変異種）

正式なモンスター画像は、元デザイン・全身・縦横比を維持し、背景だけを除去したアルファチャンネル付きPNGを `img/monsters/` に置きます。白背景や、市松模様が画像自体に焼き込まれたJPEGをそのまま正式アセットにしないでください。

人間キャラクターの項目に加えて:

```json
{
  "id": "mon_006",
  "worldId": "world_001",
  "rarity": "normal",
  "drops": [
    { "itemId": "item_003", "rate": 0.7, "qty": [1, 2] }
  ],
  "recruit": {
    "baseRate": 0.2,
    "failBonus": 0.05,
    "guaranteeAfter": 8,
    "duplicateTo": [ { "itemId": "item_009", "qty": 3 } ]
  },
  "exp": 15,
  "gold": 10
}
```

| 項目 | 意味 |
|---|---|
| `worldId` | 所属する思想世界 |
| `rarity` | `normal` / `rare`（希少種）/ `variant`（変異種）/ `strong`（強敵）/ `boss` |
| `variantOf` | 変異種・希少種の元モンスターID（任意）。**変異種は必ず別IDで作る** |
| `drops` | ドロップ。`rate` は0〜1、`qty` は [最小, 最大]。品質のあるアイテムは品質も抽選される |
| `recruit.baseRate` | 基礎加入率（0〜1）。**全モンスターに必須**（原則すべて仲間にできる） |
| `recruit.failBonus` | 加入失敗1回ごとに加算される補正 |
| `recruit.guaranteeAfter` | この回数失敗したら次は確定加入 |
| `recruit.duplicateTo` | 所持済みの種類が加入したときに変換される素材 |
| `exp` / `gold` | 撃破時の獲得量の基準（敵のレベルで増える。`balance.rewards`） |

モンスターを出現させるには、エンカウントテーブル（`encounters.json`）に追加します（下記）。

ボスの特殊加入条件は Phase 7 で追加します。

## 特技を追加する（`skills.json`）

```json
{
  "id": "skill_011",
  "name": "（仮）新しい特技",
  "mpCost": 10,
  "countsAsAttack": true,
  "description": "説明文。",
  "element": "elem_002",
  "trigger": { "type": "attackCountMultiple", "n": 2 },
  "effects": [
    { "type": "damage", "target": "enemySingle", "power": 1.5 }
  ]
}
```

サンプル:
- 通常攻撃系: `skill_001`（2の倍数）, `skill_002`（多段・3の倍数）, `skill_005`（属性）
- 回復: `skill_003`（味方HP50%以下で単体回復）, `skill_009`（4回ごとに全体回復）
- 状態異常: `skill_004`（毒）, `skill_008`（麻痺）
- 条件付き: `skill_006`（敵が毒状態）, `skill_007`（自分HP30%以下）, `skill_010`（敵HP25%以下）

使える `trigger` と `effects` の一覧は [battle-system.md](battle-system.md)。
複合条件: `{ "type": "all", "of": [ { "type": "attackCountMultiple", "n": 2 }, { "type": "enemyHpBelow", "pct": 50 } ] }`

`countsAsAttack` は、その行動で攻撃回数を進めるかを表す。省略時は `true`。回復・防御・構え・チャージ・
お絵描き・待機など、攻撃しない特技には `false` を明記する。どちらでもターン数は1進む。
`attackCountMultiple` / `attackCountEvery` はターン数ではなく攻撃回数だけを参照する。

予約完成を使う特技は `scheduleEffects`、その完成に連動するコンボ特技は `comboFrom` と
`completionEffects` を使う。コンボ特技も5枠のセット対象で、直接の発動候補にはならない。
戦闘中1回だけの特技には `oncePerBattle: true` を付ける。蓄積値は `markers.json` に上限つきで定義し、
`addMarker` / `markerScaledDamage` / マーカー条件からID参照する。

### 犬族共通スタック「犬の好意」

`marker_002`「犬の好意」はイロワン専用ではなく、犬族（`species_003`）が利用できる種族共通スタックです。
上限は10で、パーティ共有ではありません。各犬族ユニットが自身の `markers.marker_002` に個別保持します。
犬族であるだけでは自動的に増えず、付与・消費・参照する特技やパッシブを持つ場合だけ利用します。
犬の好意を使わない犬族がいても構いません。新しい犬族を追加するときは別IDを作らず、既存の `marker_002` を再利用してください。

種族限定マーカーを追加する場合は、マーカーデータへ `allowedSpeciesIds` を指定します。

```json
{
  "id": "marker_002",
  "name": "犬の好意",
  "maxStacks": 10,
  "allowedSpeciesIds": ["species_003"]
}
```

条件成立時にターン外で発動する特技は `immediateTrigger` を使う。

```json
{
  "trigger": { "type": "always" },
  "immediateTrigger": {
    "type": "markerThresholdReached",
    "markerId": "marker_002",
    "thresholds": [3, 6, 9]
  }
}
```

`damaged` は被ダメージ時反応に使う。即時発動はターン・攻撃回数を増やさず、同一特技の再入を防止する。
閾値は減少後の再到達で再発動できるが、同じ1回のスタック変化では1回だけ発動する。

種族連携は `speciesIds` と `applyStatusBySpecies` / `speciesScaledDamage` /
`advanceAttackCountBySpecies` を使う。攻撃回数の直接加算は倍数特技をその場で発動させない。
全属性は `allElementDamage`、ランダム属性は `randomElementDamage`、次の実攻撃に連携させる場合は
コンボ元の `queueComboOnNextAttack` とコンボ特技の `comboFrom` / `completionEffects` を組み合わせる。

**新しい種類の条件**が必要なら `src/battle/conditions.js` の `CONDITIONS` に登録します。
**新しい種類の効果**は `src/battle/effects.js` の `EFFECTS` に登録します。

## 状態異常を追加する（`statuses.json`）

```json
{
  "id": "status_004",
  "name": "（仮）防御ダウン",
  "kind": "statModifier",
  "durationMs": 8000,
  "params": { "stat": "def", "pct": -20 },
  "description": "防御力が20%下がる。"
}
```

`kind` は `damageOverTime` / `attackDelay` / `statModifier` / `skipAction` など（詳細は [battle-system.md](battle-system.md)）。
新しい種類は `src/battle/statusEffects.js` に登録します。

継続期間は `durationMs`（経過時間）または `durationTurns`（対象自身の行動回数）のどちらか一方を指定します。
ターン基準では `"turnTiming": "actionStart"` または `"actionEnd"`（省略時）も指定できます。
「2ターン」は、対象ユニットが2回行動した後に終了するという意味です。

## 固有パッシブを追加する（`passives.json`）

```json
{
  "id": "passive_006",
  "name": "（仮）新しいパッシブ",
  "description": "画面に出る説明文。効果の数値と一致させる。",
  "effects": [ { "type": "flatStatPct", "stat": "atk", "pct": 5 } ]
}
```

効果の種類は `src/battle/passives.js` の `PASSIVE_EFFECTS`。新しい種類はそこに登録します。

## アイテムを追加する（`items.json`）

```json
{ "id": "item_011", "name": "（仮）新しい素材", "category": "material", "hasQuality": true, "description": "説明文。" }
```

| 項目 | 値 |
|---|---|
| `category` | `consumable`（消耗品）/ `material`（素材）/ `growth`（育成）/ `key`（重要） |
| `hasQuality` | `true` なら 普通〜最高品質 の5段階で数量を分けて持つ。`false` なら品質なし |
| `use` | 消耗品の効果（任意）例 `{ "type": "healPctOfMaxHp", "pct": 30 }`。品質で効果量が上がる。種類は `src/progression/consumables.js` の `ITEM_USES` |

品質の名前と段階は `balance.json` の `qualities`。
ガチャチケットや討伐証のような「通貨」はアイテムではなく `currencies.json` に追加します。

## 装備を追加する（`equipment.json`）

```json
{
  "id": "equip_005",
  "name": "（仮）新しい装備",
  "description": "説明文。",
  "baseStats": { "atk": 8 },
  "enhancePerPlus": { "atk": 1 },
  "randomStats": { "count": 1, "pool": [ { "stat": "hp", "min": 5, "max": 15 } ] }
}
```

- 能力のキー: `hp` `mp` `atk` `def` `intervalPct`（攻撃間隔を%短縮）
- `enhancePerPlus`: 強化+1ごとの上昇量（最大+10、`balance.equipment.maxPlus`）
- `randomStats`: 入手時に `pool` から `count` 個を抽選。装備そのものに品質はありません。

## 思想世界を追加する（`worlds.json`）

```json
{
  "id": "world_002",
  "name": "（仮）世界の名前",
  "theme": "友達の輪に自分だけ入れない寂しさ",
  "description": "説明文。",
  "startTownId": "town_002"
}
```

`theme` は街の画面に縦書きで大きく表示されます。世界ごとに街・地点・モンスターを `worldId` で紐付けます。

## 街を追加する（`towns.json`）

```json
{
  "id": "town_002",
  "worldId": "world_002",
  "name": "（仮）街の名前",
  "background": null,
  "facilities": [
    { "id": "fac_008", "type": "inn", "name": "宿屋" },
    { "id": "fac_009", "type": "exit", "name": "街の外へ" }
  ],
  "connections": [ { "to": "loc_005", "distance": 1 } ]
}
```

- 施設は街ごとに自由に選べます。`type` の処理は `src/ui/facilities.js` に登録します（未登録なら「準備中」表示）。
- `background` に画像パスを書くと街の背景になります。

## 探索地点を追加する（`locations.json`）

サンプル: `loc_001`（基本）、`loc_002`（夕方・夜だけの採取物、隠し要素）、`loc_003`（隠し要素で道が開く）

```json
{
  "id": "loc_005",
  "worldId": "world_002",
  "name": "（仮）地点の名前",
  "kind": "field",
  "region": "region_002",
  "description": "説明文。",
  "actions": ["explore", "gather", "searchMonsters", "investigate"],
  "encounterTableId": "enc_005",
  "encounterRate": 0.5,
  "qualityBonus": 0,
  "gathering": [
    { "itemId": "item_001", "weight": 5, "qty": [1, 2] },
    { "itemId": "item_011", "weight": 1, "qty": [1, 1], "when": { "periods": ["night"] } }
  ],
  "secrets": [
    {
      "flag": "flag_003",
      "chance": 0.5,
      "message": "（仮）見つけたときの文章。",
      "rewards": { "items": [ { "itemId": "item_008", "qty": 1 } ] }
    }
  ],
  "connections": [
    { "to": "town_002", "distance": 1 },
    { "to": "loc_006", "distance": 2, "requires": { "flags": ["flag_003"] }, "lockedHint": "通れないときのヒント" }
  ]
}
```

| 項目 | 意味 |
|---|---|
| `kind` | `field`（通常）/ `dungeonEntrance`（ダンジョン入口） |
| `region` | 地域。天候はこの地域のものを使う |
| `actions` | この地点でできる探索行動（`balance.exploration.actions` のキー） |
| `encounterTableId` | エンカウントテーブル。「探索する」「モンスターを探す」がある地点では必須 |
| `encounterRate` | 「探索する」でエンカウントする確率（天候の倍率がかかる） |
| `qualityBonus` | この地点の採取物の品質補正（任意） |
| `gathering` | 採取テーブル。`weight` は出やすさ、`when` で時間帯・天候・フラグ条件 |
| `secrets` | 「詳しく調べる」で見つかる隠し要素。見つけると `flag` が立つ（1回だけ）。`rewards` は任意 |
| `connections` | 行き先。`distance` は進む時間、`apCost` で行動力消費、`requires`（flags / items）で解放条件 |

## 地域・天候を追加する（`regions.json` / `weathers.json`）

```json
{ "id": "region_002", "worldId": "world_002", "name": "（仮）地域名",
  "weatherTable": [ { "weatherId": "weather_001", "weight": 60 }, { "weatherId": "weather_006", "weight": 40 } ] }
```

```json
{ "id": "weather_007", "name": "（仮）砂嵐", "encounterRate": 1.2, "qualityBonus": 0.2, "description": "説明文。" }
```

時間帯が変わるたびに、地域ごとに `weatherTable` から天候が抽選されます。

## エンカウントテーブルを追加する（`encounters.json`）

```json
{
  "id": "enc_005",
  "name": "（仮）管理用の名前",
  "entries": [
    { "weight": 5, "enemies": [ { "defId": "mon_006", "level": [3, 5] } ] },
    { "weight": 2, "enemies": [ { "defId": "mon_006", "level": [3, 4] }, { "defId": "mon_007", "level": [3, 4] } ] },
    { "weight": 1, "when": { "periods": ["night"], "weathers": ["weather_004"] },
      "enemies": [ { "defId": "mon_008", "level": [6, 7] } ] }
  ]
}
```

- 1行が1つの敵グループ。条件（`when`）を満たす行から `weight` で抽選。
- 敵は1〜3体（`balance.battle.maxEnemies`）。レベルは [最小, 最大]。
- 希少種・変異種は `when` で出現条件を絞ると特別感が出ます。

## 図鑑の段階を変える（`balance.json` の `codex.monsterStages`）

モンスター図鑑の情報は、上から順に条件を満たした段階の `reveals` が開きます。

```json
{ "id": "research", "name": "調査", "requires": { "type": "counter", "counter": "defeated", "min": 5 }, "reveals": ["skills", "description"] }
```

- `requires.type`: `codexFlag`（encountered / defeated / recruited）、`counter`（撃破数など）、`saveFlag`（ゲーム全体のフラグ）
- `reveals`: `basic` `habitat` `stats` `drops` `skills` `passives` `recruit` `description`（`basic` を開くと一覧に名前が出る）
- 特定のモンスターだけ段階を足したいときは、モンスターデータに `"codexStages": [ ... ]`（同じ形式）を書きます。
  例: イベントで立つフラグで説明文が開く、など。

アイテム図鑑は自動です。入手方法（採取・ドロップ・ショップ・製作・イベント・ボス報酬など）はデータから逆引きされ、
実際に入手した方法には「入手済み」が付きます。

## フラグ

進行管理用のフラグ（`flag_001` 形式）はセーブの `flags` に保存されます。
今はデータ上で「隠し要素（secrets）で立てる」「接続の解放条件（requires.flags）」「出現条件（when.flags / notFlags）」に使えます。
解放条件に使ったフラグを立てる手段がデータにないと、`npm run validate` が警告します。

## イベントを追加する（`events.json`）

住民・酒場・街探索の施設を開くと、条件を満たすイベントから1つが抽選されます。

```json
{
  "id": "event_011",
  "trigger": "tavern",
  "nodeId": "town_001",
  "weight": 3,
  "once": true,
  "when": { "periods": ["night"], "flags": ["flag_002"], "notFlags": ["flag_003"] },
  "lines": ["（仮）表示する文章。", "複数行も書ける。"],
  "effects": [
    { "type": "giveItem", "itemId": "item_002", "qty": 1, "quality": "q2" },
    { "type": "giveCurrency", "currencyId": "cur_001", "qty": 100 },
    { "type": "setFlag", "flag": "flag_006" }
  ]
}
```

- `trigger`: `residents`（住民と話す）/ `tavern`（酒場）/ `townExplore`（街を探索する）
- `once: true` のイベントは一度しか起きません。
- 結果の種類は `src/events/events.js` の `EVENT_EFFECTS` に登録します。
- 噂話で次の目的地のヒントを出す使い方がおすすめです（`event_004`〜`event_006` を参照）。
- フィールドの小さな発見は、地点の `secrets` でも作れます。

## ショップを追加する（`shops.json`）

```json
{
  "id": "shop_002",
  "name": "（仮）店の名前",
  "sellRate": 0.5,
  "items": [ { "itemId": "item_002", "quality": "q1", "price": 30 } ],
  "equipment": [ { "defId": "equip_001", "price": 200, "when": { "flags": ["flag_002"] } } ]
}
```

街の施設に `{ "type": "shop", "shopId": "shop_002", ... }` と書くとその店になります。
売値はアイテムの `price` × `sellRate` × 品質の倍率。`when` で品ぞろえを変えられます。

## 製作レシピを追加する（`recipes.json`）

```json
{
  "id": "recipe_004",
  "name": "（仮）作るもの",
  "output": { "equipmentId": "equip_002" },
  "inputs": [ { "itemId": "item_005", "qty": 2 }, { "itemId": "item_001", "qty": 1, "minQuality": "q3" } ],
  "gold": 30
}
```

`output` は `equipmentId`（装備1個）か `itemId`＋`qty`。`minQuality` を書くと、その品質以上の素材だけを使います。

## ダンジョンを追加する（`dungeons.json`）

```json
{
  "id": "dgn_002",
  "name": "（仮）ダンジョン名",
  "description": "説明文。",
  "entranceNodeId": "loc_010",
  "requires": { "items": ["item_010"] },
  "lockedHint": "入れないときのヒント",
  "stages": [ { "encounterTableId": "enc_010" }, { "encounterTableId": "enc_010" }, { "bossId": "boss_002" } ]
}
```

入口の地点に `"dungeonId": "dgn_002"` を書くと、地点画面に入口が出ます。
入場の行動力は `balance.dungeon.enterAp`。HP・MPは戦闘ごとに回復しません。

## ボスを追加する（`bosses.json`）

先にボスの元になるモンスターを `monsters.json` に追加します（`rarity: "boss"`、`recruit: { "baseRate": 0, "special": true, "duplicateTo": [...] }`）。

```json
{
  "id": "boss_002",
  "name": "（仮）ボス名",
  "monsterId": "mon_010",
  "level": 20,
  "statMultiplier": { "hp": 4, "atk": 1.2 },
  "skills": ["skill_001"],
  "statusImmune": ["status_002"],
  "charge": { "skillId": "skill_013", "everyNAttacks": 4, "chargeMs": 3000, "message": "（仮）予兆の文章" },
  "breakGauge": { "max": 14, "durationMs": 6000, "damageTakenPct": 50 },
  "phases": [ { "hpBelowPct": 50, "skills": ["skill_004", "skill_001"], "statPct": { "atk": 20 }, "message": "（仮）" } ],
  "gimmicks": [ { "atMs": 90000, "statPct": { "atk": 50 }, "message": "（仮）" } ],
  "parts": [ { "key": "arm", "name": "（仮）腕", "hpPct": 30, "def": 8,
    "onDestroy": { "removeSkills": ["skill_008"], "statPct": { "atk": -20 }, "message": "（仮）" } } ],
  "recruit": { "chance": 1, "conditions": [ { "type": "breakCount", "min": 1 } ], "hint": "（仮）ヒント" },
  "rewards": { "gold": 300, "items": [ { "itemId": "item_007", "qty": 3 } ] },
  "defeatFlag": "flag_010"
}
```

すべての項目は任意（`id` `monsterId` `level` 以外）。各項目の動きは [battle-system.md](battle-system.md) の「ボス」を参照。
強さの調整には、パーティのレベル別勝率を見るのが便利です（`docs/TODO.md` の「バランス確認」）。
