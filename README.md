# 思想世界RPG

スマートフォンのブラウザで遊ぶ、長期運用・拡張型RPGの初期基盤です。
人間の具体的な思想・感情をテーマにした世界を探索し、モンスターと人間キャラクターを集め、
攻撃回数型の自動戦闘で進めます。

**現在の状態: Phase 1〜9 完了（プロトタイプ完成）**。
街・探索・攻撃回数型の自動戦闘・仲間集め・育成・連戦ダンジョン・ボス・図鑑まで、一通り遊べます。

**引き継ぎを受けた方は、まず [docs/HANDOFF.md](docs/HANDOFF.md) を読んでください**
（実装済み／未実装／仮実装／構成／コンテンツ追加方法／テスト／ビルド／起動／公開／次の作業 をまとめています）。

## すぐに動かす

必要なもの: Node.js 20 以上（外部パッケージは使いません。`npm install` は不要です）

```sh
npm start          # http://localhost:8080 で起動（同じWi-Fiのスマホからも開ける）
npm test           # 自動テスト
npm run validate   # data/ の検証（ID重複・参照切れ・必須項目）
npm run check      # validate + test（コミット前に必ず）
npm run sim -- --boss boss_001   # バランス確認（パーティのレベル別勝率）
npm run e2e        # 画面の通しテスト（Playwright を一時的に入れて使う。docs/HANDOFF.md 参照）
```

ES Modules と `fetch` を使うため、`index.html` をファイルとして直接開いても動きません。必ずサーバー経由で開いてください。

## 公開

ビルド工程はありません。リポジトリのファイルをそのまま静的ホスティングに置けば動きます。

- **GitHub Pages**: Settings → Pages → Branch に `main` / `(root)` を指定
- **Cloudflare Pages**: ビルドコマンドなし、出力ディレクトリ `/`

公開先ではデバッグ機能は自動で無効になります（`src/config.js`）。

## ディレクトリ構成

```
index.html          入口
css/main.css        スタイル（スマホ縦画面優先）
  data/               ゲームコンテンツ（JSON）。コンテンツ追加は基本ここだけ（種族タグもID管理）
src/
  core/             データ読み込み・検証・乱数・エラー
  save/             セーブの形・マイグレーション・保存先
  progression/      ユニット入手・レベル・ランク（ランクアップ）・特技セット・編成・装備（強化）・アイテム・品質・HP・消耗品・図鑑記録
  battle/           戦闘エンジン・発動条件・効果・状態異常・パッシブ
  exploration/      地点移動・探索行動・時間・天候・エンカウント・出現条件・連戦ダンジョン
  town/             ショップ・製作
  events/           イベント（住民・酒場・街探索）
  codex/            図鑑（段階解放・入手方法の逆引き）
  game/             新規ゲーム作成・セッション・戦闘結果の反映・加入判定・宿屋
  ui/               画面（screens/）と共通部品
  debug/            開発環境限定のデバッグパネル
  config.js         設定（デバッグの有効条件など）
  main.js           エントリーポイント
scripts/            ローカルサーバー・データ検証・バランス確認
  tests/              自動テスト（node:test、234件）
e2e/                画面の通しテスト（任意）
docs/               開発ドキュメント
AGENTS.md           AIエージェント（Codex等）向けの作業ルール
```

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | **引き継ぎ書**（依頼書 第46項の10項目） |
| [docs/README.md](docs/README.md) | ゲーム概要とPhaseの進み具合 |
| [docs/architecture.md](docs/architecture.md) | 構成・主要システム・データの流れ |
| [docs/battle-system.md](docs/battle-system.md) | 攻撃回数型戦闘の仕様 |
| [docs/exploration-system.md](docs/exploration-system.md) | フィールド・行動力・時間・天候・エンカウント |
| [docs/content-guide.md](docs/content-guide.md) | 新しいコンテンツの追加方法 |
| [docs/monster-development-guide.md](docs/monster-development-guide.md) | モンスター追加の標準手順・短縮依頼テンプレート |
| [docs/save-data.md](docs/save-data.md) | セーブデータの構造とバージョン管理 |
| [docs/TODO.md](docs/TODO.md) | 未実装・仮実装・改善点・次に依頼するとよい作業 |
