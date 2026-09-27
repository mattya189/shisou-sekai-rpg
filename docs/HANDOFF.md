# 引き継ぎ書（Codex などの次の開発者へ）

『思想世界RPG』初期開発依頼書 v0.1 の Phase 1〜9 をすべて実装した時点の引き継ぎ書です。
依頼書 第46項の10項目の順にまとめています。作業を始める前に、ルート直下の `AGENTS.md` も読んでください。

---

## 1. 実装済み機能

プロトタイプの範囲（世界1・街1・探索地点3＋ダンジョン1・人間2・モンスター5＋ボス1・アイテム10）で、
**街 → フィールド選択 → 探索 → エンカウント → 攻撃回数型自動戦闘 → ドロップ → モンスター加入 → 編成・育成 → ダンジョン → ボス**
のループが最初から最後まで遊べます。

| 分野 | 内容 | 主なファイル |
|---|---|---|
| データ | すべてのコンテンツをJSONで定義。起動時と `npm run validate` で ID形式・重複・参照切れ・必須項目・パラメータを検証 | `data/`, `src/core/` |
| セーブ | localStorage、saveVersion＋マイグレーション、欠損項目の自動補完、壊れたセーブの退避、保存先の差し替え口 | `src/save/` |
| ユニット | 人間とモンスターを同じ仕組みで管理、同種1体、重複は素材変換、Lv上限100、ランク、能力値計算 | `src/progression/` |
| 編成 | 4枠・自由混成、特技セット最大5・優先順位の並べ替え、装備2枠の付け替え | `src/progression/`, `src/ui/screens/` |
| 戦闘 | 攻撃回数型リアルタイム自動戦闘、発動条件11種、MP不足時の次候補、通常攻撃のMP回復、状態異常3種、固有パッシブ5種、属性、×1/×2/×3、seed固定で完全再現 | `src/battle/` |
| ボス | 大技予兆、BREAK、HPフェーズ、時間経過ギミック、部位破壊、状態異常耐性、特殊加入条件 | `src/battle/`, `data/bosses.json` |
| 探索 | 選択式の地点移動、条件付きの道、行動力、探索行動4種、ゲーム内時間、地域ごとの天候、エンカウントテーブル、隠し要素 | `src/exploration/` |
| 報酬・加入 | 経験値・ゴールド・ドロップ（品質抽選）、加入判定（基礎率＋失敗補正の蓄積＋確定）、HP持ち越し、全滅時の帰還 | `src/game/` |
| アイテム | 5分類、品質5段階の数量管理とまとめ表示、所持上限なし、通貨は別枠、消耗品（品質で効果アップ） | `src/progression/` |
| 街 | 宿屋、ショップ（売買）、工房（強化+10・製作）、酒場・住民・街探索のイベント | `src/town/`, `src/events/` |
| ダンジョン | 連戦（HP・MP持ち越し）、入場条件、撤退、踏破記録、途中セーブからの再開 | `src/exploration/dungeon.js` |
| 図鑑 | モンスター図鑑（遭遇・撃破・調査・加入で段階的に開く）、アイテム図鑑（品質ごとの入手状況・入手方法の逆引き）、達成状況 | `src/codex/` |
| UI | スマホ縦画面優先（360px〜）、下部ナビ、タップ領域40〜48px、PCでは中央1カラム | `src/ui/`, `css/main.css` |
| デバッグ | 開発環境だけで有効。ユニット/アイテム/装備/通貨の取得、Lv・ランク変更、行動力・HP回復、時間・天候変更、全地点解放、フラグ操作、任意の戦闘、ボス戦、図鑑の全開放、セーブの確認・書き換え・初期化 | `src/debug/` |
| 開発用ツール | データ検証、バランス確認（レベル別勝率）、画面の通しテスト | `scripts/`, `e2e/` |

## 2. 未実装機能

依頼書のプロトタイプ範囲で未実装のものはありません。依頼書で「将来」「未確定」とされているもの:

- **メインストーリー・主人公**（未確定。勝手に追加していません）
- **人間キャラクターの入手方法**（現在は開始時とデバッグのみ。酒場での加入などが候補）
- 2つ目以降の思想世界と、世界間の移動
- ガチャ（通貨 `cur_002` の枠だけ用意）、オンライン保存、アカウント
- 狙う敵を指定する仕組み（味方は先頭の敵、敵はランダムに狙う）
- 行動力の最大値アップ（`balance.actionPoints.cap` の枠だけ用意）
- サウンド、アニメーション演出、本番用の画像（すべて自動生成の仮画像）

## 3. 仮実装

名前・文章・数値は**すべて仮**です。名前には「（仮）」が付いています。

- 最初の世界のテーマは依頼書の例「頑張ったのに誰にも褒めてもらえなかった悔しさ」を仮置き
- 属性4種・状態異常4種・天候6種・ランク5段階は仮の体系
- 数値の多くは `data/balance.json` に集約（経験値曲線、ランク倍率と費用、行動力、時間、宿代、報酬、強化費用、戦闘の定数、図鑑の段階）
- 仮で決めたルール（変更可）:
  - HPはフィールドで持ち越し、宿屋・消耗品で回復。MPはフィールド戦闘後に全回復
  - 全滅すると最後の街へ戻り、HPが1になる（ペナルティなし）
  - 加入は1戦闘1体まで、種類ごとに1回判定。加入時のレベルは倒した敵のレベル
  - 経験値は生き残った味方全員に全額
  - 部位は本体より前に並び、味方は部位から攻撃する
  - ボスの特殊加入は「BREAK1回以上＋部位破壊1つ以上で撃破」で確率100%
- ボスの強さは「万全ならLv6前後で勝率9割」を目安に調整（`npm run sim -- --boss boss_001` で確認できる）

詳しくは [TODO.md](TODO.md)。

## 4. ディレクトリ構成

```
index.html                 入口
css/main.css               スタイル（スマホ縦画面優先。色やサイズはファイル冒頭の変数）
data/                      ゲームコンテンツ（JSON）。manifest.json に読み込むファイルを登録
  balance.json             調整用の数値（1ファイルにまとめる）
src/
  main.js                  起動（データ読込 → 検証 → セーブ → 画面）
  config.js                設定（デバッグが有効になる条件）
  core/                    データ読込（gameData）・検証（schema）・乱数（rng）・定数・エラー
  save/                    セーブの形・マイグレーション・保存先
  progression/             ユニット・レベル・ランク・特技セット・編成・装備・強化・アイテム・品質・HP・消耗品・図鑑記録
  battle/                  戦闘エンジン・発動条件・効果・状態異常・パッシブ・ダメージ・ボス
  exploration/             地点移動・探索行動・時間と天候・エンカウント・出現条件・ダンジョン
  town/                    ショップ・製作
  events/                  イベント
  codex/                   図鑑の表示内容と逆引き
  game/                    セッション・新規ゲーム・戦闘結果の反映・加入判定・宿屋
  ui/                      画面の土台（app.js）・部品・画面（screens/）・戦闘ログの文章化
  debug/                   デバッグパネル（開発環境のみ読み込まれる）
scripts/                   serve.mjs（ローカルサーバー）・validate-data.mjs・balance-sim.mjs
tests/                     自動テスト（node:test、177件）
e2e/                       画面の通しテスト（Playwright、任意）
docs/                      開発ドキュメント
AGENTS.md                  AIエージェント向けの作業ルール
```

層の考え方（どこに何を書くか）は [architecture.md](architecture.md)。

## 5. 新しいコンテンツの追加方法

基本は **`data/` のJSONに1件追加 → `npm run check`** です。コードの変更は不要です。
カテゴリごとの書き方・サンプル・IDのルールは [content-guide.md](content-guide.md) にあります
（人間キャラクター、モンスター、特技、状態異常、パッシブ、アイテム、装備、思想世界、街、地点、地域・天候、
エンカウント、イベント、ショップ、製作レシピ、ダンジョン、ボス、図鑑の段階）。

新しい**種類の仕組み**が必要なときは、対応するレジストリに1件登録します。

| 追加したいもの | 登録先 |
|---|---|
| 特技の発動条件 | `src/battle/conditions.js` の `CONDITIONS` |
| 特技の効果 | `src/battle/effects.js` の `EFFECTS` |
| 状態異常の種類 | `src/battle/statusEffects.js` の `STATUS_KINDS` |
| パッシブ効果 | `src/battle/passives.js` の `PASSIVE_EFFECTS` |
| 探索行動 | `src/exploration/actions.js` の `EXPLORE_ACTIONS`（＋ `balance.exploration.actions`） |
| 消耗品の効果 | `src/progression/consumables.js` の `ITEM_USES` |
| イベントの結果 | `src/events/events.js` の `EVENT_EFFECTS` |
| ボスの加入条件 | `src/game/battleOutcome.js` の `BOSS_RECRUIT_CONDITIONS` |
| 図鑑の解放条件 | `src/codex/codex.js` の `CODEX_REQUIREMENTS` |
| 街の施設の種類 | `src/ui/facilities.js` の `FACILITY_HANDLERS` |
| データのカテゴリ | `src/core/schema.js` の `CATEGORY_SCHEMAS` ＋ `data/manifest.json` |

## 6. テスト方法

```sh
npm test            # 自動テスト（177件）。戦闘は seed 固定で結果を検証
npm run validate    # データ検証（ID重複・参照切れ・必須項目など）
npm run check       # 上の2つをまとめて実行。コミット前に必ず実行
npm run sim -- --boss boss_001                    # バランス確認（レベル別の勝率）
npm run sim -- --enemies mon_004:8,mon_003:7 --levels 5,8,10
```

画面の通しテスト（任意。Playwright を一時的に入れて使う）:

```sh
npm i --no-save playwright && npx playwright install chromium
npm run e2e         # スマホ縦画面で主要画面を操作。コンソールエラー・横スクロールも確認
```

テストの場所: `tests/core` `tests/save` `tests/progression` `tests/battle` `tests/exploration` `tests/game` `tests/town` `tests/codex` `tests/ui`。
戦闘テスト用のテスト役・サンドバッグは `tests/helpers.js` の `loadBattleData()`。

## 7. ビルド方法

**ビルド工程はありません。** 素の JavaScript（ES Modules）をそのままブラウザで読み込みます。
外部パッケージにも依存していないので、`npm install` も不要です。

## 8. ローカル起動方法

```sh
npm start           # http://localhost:8080
PORT=3000 npm start # ポートを変える
```

- 同じWi-Fiのスマホからは、起動時に表示される `http://192.168.x.x:8080` で開けます（デバッグも有効）。
- `index.html` をファイルとして直接開くと動きません（fetch と ES Modules のため）。必ずサーバー経由で。
- Node.js がない場合は `python -m http.server 8080` でも動きます。

## 9. 公開方法

リポジトリのファイルをそのまま静的ホスティングに置けば動きます。

- **GitHub Pages**: Settings → Pages → Branch を `main` / `(root)` に
- **Cloudflare Pages**: ビルドコマンドなし、出力ディレクトリ `/`

公開先ではデバッグ機能が自動で無効になります（`src/config.js` の `debug.mode: 'auto'`）。
検証用に公開先でデバッグを使いたいときは、検証用ブランチでだけ `mode: 'on'` にしてください。

## 10. 次に Codex へ依頼する作業

優先度の高い順の提案です。

1. **世界観が決まったら、仮データを本番データに置き換える**
   名前・説明文・テーマの差し替えは JSON の編集だけで済みます（IDは変えない）。
2. **人間キャラクターの入手方法を決めて実装する**
   例: 酒場のイベント（`events.json`）に「仲間になる」結果を追加 → `EVENT_EFFECTS` に `grantUnit` を登録。
3. **2つ目の思想世界を追加する**
   `data/manifest.json` で世界ごとにファイルを分け、世界間の移動（街の施設 or 接続）を追加。
4. **バランス調整**
   `npm run sim` で敵・ボスの強さを確認しながら `balance.json` と各データを調整。
5. **演出の追加**（攻撃・被弾のアニメーション、BREAK・大技の強調、効果音）
   戦闘ログのイベント（`battle.log`）を見て画面側で演出を足せる作りになっています。
6. **本番画像への差し替え**
   各データの `image` にパスを書くだけで仮画像から置き換わります（街は `background`）。
7. **狙う敵の指定、オート周回**（`runToEnd` で戦闘を一瞬で終わらせられるので周回は作りやすい）

作業の進め方は `AGENTS.md`（データで追加・IDを変えない・レジストリに登録・`npm run check`）に従ってください。
