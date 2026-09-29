# アーキテクチャ

## 方針

1. **データ駆動**: コンテンツは `data/*.json`。コードは「種類（type）」ごとの処理だけを持つ。
2. **ロジックとUIの分離**: ゲームのルールはDOMに依存しない純粋な関数で書き、Node.js のテストから直接検証する。
3. **依存ゼロ**: 素のJavaScript（ES Modules）。ビルド工程なし。型はJSDocで補う。
4. **決定的な乱数**: すべての乱数は `src/core/rng.js` の seed 固定可能な生成器を通す。

## 層と依存の向き

```
ui/  debug/            画面。session と各ロジックの関数を呼ぶ
  ↓
game/                  セッション・新規ゲーム作成・戦闘結果の反映・加入判定・宿屋（複数の仕組みをまとめる処理）
  ↓
exploration/ town/ events/ codex/  冒険先選択・スタミナ・探索行動・時間・天候・エンカウント・ダンジョン / ショップ・製作 / イベント / 図鑑
progression/  battle/  ルール（入手・育成・編成・装備・アイテム・HP / 戦闘）
  ↓
save/  core/           セーブの形と読み書き / データ読み込み・検証・乱数
```

上の層は下の層を呼んでよいが、逆は禁止です。`core` `save` `progression` `battle` `exploration` `game` は `document` や `window` に触れません。
共有の定数は `src/core/constants.js`（依存なし）に置き、循環 import を避けています。

## 主要モジュール

| ファイル | 役割 |
|---|---|
| `src/core/gameData.js` | `data/manifest.json` に従いJSONを読み込み、IDで引ける `GameData` を作る。`get`（無ければ例外）/ `find`（無ければ null）/ `list` / `getUnitDef`（人間とモンスターを共通で引く） |
| `src/core/schema.js` | カテゴリごとのID接頭辞・必須項目・参照先の定義と検証。新カテゴリはここに追加 |
| `src/core/rng.js` | mulberry32。`next` `int` `chance` `pick` `weighted` `getState/setState` |
| `src/core/errors.js` | `GameError(code, message)`。プレイヤー操作の失敗（素材不足など）を表す。UIはトーストで表示 |
| `src/save/saveSchema.js` | セーブの初期形（`createEmptySave`）と欠損項目の補完（`normalizeSave`） |
| `src/save/migrations.js` | バージョン間の変換 |
| `src/save/saveRepository.js` | 読み込み（JSON解析→マイグレーション→補完）と保存。保存先はアダプタで差し替え可能 |
| `src/progression/*.js` | ユニット入手、レベル/ランク、特技セット、編成、装備個体、能力値計算、アイテム/通貨、図鑑記録 |
| `src/battle/engine.js` | 戦闘エンジン。`createBattle` / `advance` / `runToEnd` / `battleResult` |
| `src/battle/conditions.js` `effects.js` `statusEffects.js` `passives.js` | 発動条件・特技効果・状態異常・パッシブの**レジストリ**（検証・説明文・戦闘中の処理） |
| `src/battle/eventTriggers.js` | マーカー閾値到達・被ダメージなど、通常行動外で発動する即時特技のイベントレジストリ。再入と連鎖深度を制限する |
| `src/battle/combatant.js` | 戦闘ユニットの作成、状態異常とパッシブを反映した実効値 |
| `src/battle/setup.js` | セーブの編成から味方の参加者を作る |
| `src/ui/battleLog.js` | 戦闘ログの文章化 |
| `src/exploration/map.js` `stamina.js` `actions.js` `time.js` `encounters.js` `when.js` | 冒険先選択、時間回復スタミナ、探索行動レジストリ、時間と天候、エンカウント抽選、出現条件 |
| `src/game/battleOutcome.js` | 戦闘結果をセーブに反映（HP・経験値・ゴールド・ドロップ・加入・全滅） |
| `src/game/recruit.js` `inn.js` | 加入判定、宿屋 |
| `src/progression/hp.js` `quality.js` `consumables.js` | フィールドの現在HP、品質抽選、消耗品の使用レジストリ |
| `src/progression/enhance.js` `rankUp.js` | 装備強化（+10まで）、ランクアップ |
| `src/town/shop.js` `crafting.js` | ショップの売買、工房の製作 |
| `src/events/events.js` | イベントの抽選と実行（結果の種類はレジストリ `EVENT_EFFECTS`） |
| `src/exploration/dungeon.js` | 連戦ダンジョンの入場・進行・撤退・踏破 |
| `src/battle/combatant.js` の `createBossUnits` | ボスと部位の戦闘ユニット作成 |
| `src/codex/codex.js` `lookup.js` | 図鑑の段階解放（`CODEX_REQUIREMENTS`）、出現場所・入手方法の逆引き |
| `scripts/balance-sim.mjs` | バランス確認（パーティのレベル別勝率） |
| `e2e/smoke.mjs` | 画面の通しテスト（Playwright、任意） |
| `src/game/session.js` | 実行中の状態。画面は `session.save` を変更したあと `session.commit()` で保存・通知 |
| `src/ui/app.js` | 画面遷移（スタック）、上部バー、下部ナビ、トースト、`ctx.act()` |
| `src/ui/screens/*.js` | 各画面。`screens/index.js` に登録 |
| `src/debug/debugPanel.js` | 開発環境限定。`src/config.js` の `isDebugEnabled` が true のときだけ読み込まれる |

## データの流れ

```
起動 (src/main.js)
  → loadGameData(fetch) で data/ を読み込む
  → data.validate()   エラーがあれば一覧を画面に表示して停止（壊れたデータで遊ばせない）
  → SaveRepository(localStorage) と Session を作る
  → createApp() でタイトル画面へ

プレイヤー操作
  → 画面が ctx.act(() => progression の関数(save, data, ...))
  → 成功: session.commit() → localStorage に保存 → 再描画
  → GameError: トーストで理由を表示し、保存しない
```

progression の関数は「検証してから変更する」順で書いてあり、GameError を投げたときに save は書き換わっていません。
新しい関数を書くときもこの順番を守ってください（途中まで書き換えてから失敗すると、画面上の状態と保存内容がずれます）。

## 画面の作り方

```js
// src/ui/screens/example.js
import { h } from '../dom.js';
export default {
  nav: 'town',            // 下部ナビで選択状態にする項目（null で無し）
  chrome: true,           // false で上部バー・下部ナビを消す
  render(ctx, params, state) {
    // ctx.data / ctx.save / ctx.go(name, params) / ctx.back() / ctx.act(fn, msg) / ctx.toast(msg)
    // state はこの画面にいる間だけ保持される一時状態（タブ選択など）
    // タイマーを使うなら ctx.onCleanup(() => cancelAnimationFrame(id)) で止める
    return h('section', {}, '内容');
  },
};
```

`screens/index.js` の `SCREENS` に追加すると `ctx.go('example')` で開けます。

## ステータス計算

`src/progression/stats.js` の `computeStats` に集約しています（計算順はファイル冒頭のコメント）。
戦闘・画面表示の両方でこの関数を使い、別の場所で能力値を計算しないでください。
