# 装備追加の共通仕様

今後の装備1個の追加は、この文書と短い装備固有データだけで行う。現在の実装を正とし、未実装の機能を前提にしない。

## 最短手順

1. `data/equipment.json` に定義1件を追加する。ここを名前・説明・性能の Single Source of Truth とする。
2. 入手先を既存方式から選び、`data/shops.json`、`data/recipes.json` または `data/balance.json` の `newGame.equipment` に参照を1件追加する。
3. `npm run check` を実行する。数値やロジックを変えた場合だけ関連テストを追加する。

既存画面、インベントリ、強化、セーブ、戦闘能力値計算は定義を直接参照するため、単純な装備の追加時に複製データは不要。

## 装備定義

追加先: `data/equipment.json`

```json
{
  "id": "equip_005",
  "name": "新しい装備",
  "description": "装備の説明。",
  "baseStats": { "atk": 8 },
  "enhancePerPlus": { "atk": 1 },
  "randomStats": {
    "count": 1,
    "pool": [{ "stat": "hp", "min": 5, "max": 15 }]
  },
  "price": 300
}
```

### ID

- `equip_` + 3桁以上の未使用番号。例: `equip_005`
- 表示名をIDにしない。一度使ったIDは変更・再利用しない。セーブが `defId` として保存するため。

### フィールド

| フィールド | 必須 | 現在の扱い |
|---|---:|---|
| `id` | はい | 定義ID |
| `name` | はい | 各画面の表示名 |
| `baseStats` | はい | 装備中に加算する基礎能力 |
| `description` | いいえ | 説明。現行の装備一覧UIは未表示 |
| `enhancePerPlus` | いいえ | 強化値+1ごとの加算値。省略時は上昇なし |
| `randomStats` | いいえ | 取得時に装備個体へ抽選する能力 |
| `price` | いいえ | 売却価格の基準。店頭の購入価格は `shops.json` 側に設定 |

### 使える能力キー

`hp` / `mp` / `atk` / `def` / `matk` / `mdef` / `evasion` / `intervalPct`

- `intervalPct` は攻撃間隔を指定%短縮する。最短は `data/balance.json` の `minAttackIntervalMs`。
- その他は加算値。未登録のキーはデータ検証でエラーになる。
- 新ステータスの追加は単純な装備追加の範囲外。`src/core/constants.js`、能力値計算、UI表示、戦闘処理の対応が必要。

### 基礎性能・強化・ランダム能力

- 最終加算値 = `baseStats` + `enhancePerPlus` × 個体の `plus` + 個体の `randomStats`。
- 強化上限は現在+10。費用は `data/balance.json` の `enhance` が全装備で共通。
- `randomStats.count` 回、`pool` から1項目を選び、`min`〜`max` の整数を抽選する。現行実装では同じ項目が複数回選ばれる場合がある。
- 抽選は `grantEquipment()` で行われ、取得後の値は個体に保存される。

## 装備枠・カテゴリ・品質

- 1ユニット2枠。両枠は同じで、武器・防具・護石などのカテゴリや枠制限は現在ない。
- 装備そのものに品質はない。`q1`〜`q5` の5段階品質はアイテム用。
- 個体差は品質ではなく `randomStats` で表現する。新しい品質やカテゴリの仕組みを装備1個の追加と同時に作らない。

## 入手先

### ショップ

`data/shops.json` の対象店舗の `equipment` へ追加する。

```json
{ "defId": "equip_005", "price": 300 }
```

`when` で既存のフラグ条件等を指定できる。購入時にランダム能力が抽選される。

### 製作

`data/recipes.json` にレシピを追加する。

```json
{
  "id": "recipe_004",
  "name": "新しい装備",
  "output": { "equipmentId": "equip_005" },
  "inputs": [{ "itemId": "item_001", "qty": 2 }],
  "gold": 100
}
```

### 初期所持

`data/balance.json` の `newGame.equipment` へ `{ "defId": "equip_005" }` を追加する。初期ユニットに持たせるときは `equipTo` と `slot` も指定する。

### 敵・強敵・ボス・冒険先からの直接ドロップ

現在は未対応。モンスターとボスの戦利品、探索報酬はアイテムのみ。装備をドロップさせるには、対象データの参照検証と報酬処理から `grantEquipment()` を呼ぶ汎用実装、結果UI、テストが必要。特定敵IDのハードコードで対応しない。

## インベントリ・セーブ・戦闘反映

- `src/progression/equipment.js` の `grantEquipment()` が `uid` を発行し、`save.inventory.equipment[uid]` に `{ uid, defId, plus, randomStats }` を保存する。
- ユニット側は `equipment: [uid, uid/null]` だけを保存する。同じ個体を他ユニットに付けると元の装備先から自動で外れる。
- 定義の名前や性能はセーブせず `defId` から引く。装備定義1件の追加だけではセーブ形式とマイグレーションを変更しない。
- `src/battle/setup.js` が編成ユニットの装備個体を戦闘へ渡し、`src/progression/stats.js` の `computeStats()` がUIと戦闘の両方で同じ定義を合算する。

## 特殊効果

現在、装備が対応するのは上記の能力値加算と攻撃間隔短縮のみ。装備用の条件/効果レジストリはない。以下は未対応:

- 攻撃回数の倍数で発動する特技の強化
- 属性・状態異常・マーカー/スタックとの連動
- 戦闘開始時、行動時、条件達成時の効果
- 種族・個体専用条件

追加する場合は、装備定義用の汎用な条件/効果データ、`src/core/schema.js` の検証、戦闘参加者への反映フック、説明UI、テストを一組で設計する。戦闘の既存 `CONDITIONS` / `EFFECTS` / `PASSIVE_EFFECTS` は特技・パッシブ用であり、装備定義からは現在呼ばれない。特定モンスタ名やIDの分岐を標準方式にしない。

## 画像・図鑑

- 装備定義に画像フィールドはなく、現行UIも装備画像を表示しない。画像添付があっても、単純な装備追加ではリポジトリへ保存しない。
- 将来対応するなら `img/equipment/<equipment-id>.png` の実透過PNGと、定義の `image` 参照、スキーマ検証、各UIの表示を同時に追加する。画像内に市松模様背景を焼き込まない。
- 装備図鑑は現在ない。図鑑用の性能データを別途複製しない。将来追加時は `equipment.json` を直接参照する。

## 通常変更するファイル

| 目的 | 変更先 |
|---|---|
| 装備定義 | `data/equipment.json` |
| ショップ入手 | `data/shops.json` |
| 製作入手 | `data/recipes.json` |
| 初期所持 | `data/balance.json` の `newGame.equipment` |
| 新しい数値仕様の回帰テスト | `tests/progression/equipment.test.js` または `stats.test.js` |

単純な追加では `src/progression/equipment.js`、`src/progression/stats.js`、`src/battle/`、`src/save/`、`src/ui/` を変更しない。`data/manifest.json` も `equipment.json` が登録済みのため変更不要。

## 確認

```sh
npm run check
```

少なくとも次を確認する:

- ID形式、重複、入手先からの参照、能力キーがデータ検証を通る。
- 取得した個体に想定数のランダム能力が付く。
- 装備後の能力値と攻撃間隔が意図どおり。

UIを変えたときは `AGENTS.md` に従ってE2Eも確認する。

## 装備追加用の短縮テンプレート

```text
【装備追加】
名前：
種類（表現用）：
テーマ／説明：
基礎性能：
強化+1ごとの上昇：
ランダム能力（個数・候補・範囲）：
入手先（ショップ／製作／初期所持）：
価格／製作素材：
固有効果：なし／要新規仕様
専用装備：いいえ／はい（現状は装備制限未対応）
画像：なし／添付（現状は表示未対応）
その他：

docs/EQUIPMENT_SPEC.mdに従い、既存方式を再利用して実装する。
```

未指定の数値を推測で決めるとバランスが変わるため、`baseStats`、`enhancePerPlus`、`randomStats` は原則として依頼時に指定する。固有効果・専用制限・画像表示・直接ドロップを求める場合は、現行仕様の小変更ではないことを明記する。

## 最短Codex依頼文

```text
添付した装備追加TASKを docs/EQUIPMENT_SPEC.md に従って実装してください。既存方式を再利用し、今回の装備追加に必要な範囲だけ変更してください。npm run check が通ったらコミット・pushし、GitHub Pagesへ反映される状態まで確認してください。
```
