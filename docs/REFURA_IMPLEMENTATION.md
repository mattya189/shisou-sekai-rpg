# 拒彩獣 リフューラ 実装報告

基準：`mattya189/shisou-sekai-rpg` / main `68e04524e93a4c113139d5c7c87f2171b2f0681b`。2026-10-03作業終了前にもmainが同じSHAであることを確認。
GitHubへのcommit・push・公開は実施していません。

## 1. 実装した内容

拒彩獣 リフューラ（mon_010）を第1思想世界へ追加しました。強さ3、初期☆2、闇属性、色命族・幻獣族です。
固有パッシブ「護彩吸収」、固有4特技、共有6特技、10習得・5セット制限、加入・出現・図鑑を登録。
添付画像を背景除去した実透過PNGとして同梱しています。
依頼書の「既存の4体編成」は現行実装と不一致でした。AGENTS.md・現行balance・docsで正式に3対3化されているため、編成数は変更していません。
幻獣族または類似する既存汎用種族は存在せず（色命族・スライム・犬・浮遊族のみ）、species_005を追加しました。

## 2. 変更した既存ファイル

- `.github/workflows/unzip.yml`
- `data/encounters.json`
- `data/markers.json`
- `data/monsters.json`
- `data/passives.json`
- `data/skills.json`
- `data/species.json`
- `data/statuses.json`
- `docs/HANDOFF.md`
- `docs/TODO.md`
- `src/battle/effects.js`
- `src/battle/engine.js`
- `src/battle/eventTriggers.js`
- `src/battle/passives.js`
- `src/battle/statusEffects.js`
- `src/codex/abilities.js`
- `src/core/schema.js`
- `src/exploration/encounters.js`
- `src/progression/units.js`
- `src/ui/battleDetail.js`
- `tests/battle/engine.test.js`

入手状態作成では、rankを省略した場合に定義済みのinitialRankを使用するようにしました。
明示rankは優先し、既存所持ユニットを変更しません。initialRankのない既存定義は従来の☆1のまま。
プリズマリアの定義済み初期☆3も、rank省略の直接入手時に反映されます（通常加入時は以前から反映済み）。
エンカウントは指定された任意rankを戦闘へ渡せる最小限の拡張です。既存のrank未指定編成の戻り値は維持。
既存テストの効果レジストリ確認へ、追加したonMarkerConsumedフックを検出する条件を加えました。

## 3. 新しく追加したファイル

- `docs/COMMON_SKILLS.md`
- `docs/REFURA_IMPLEMENTATION.md`
- `img/monsters/mon_010.png`
- `tests/battle/refura.test.js`

## 4. 削除が必要なファイル

ありません。移動・名前変更もありません。DELETE_FILES.txtは作成していません。

## 5. リフューラの実装方法

登録はdata/monsters.json。専用分岐をエンジンへ追加せず、従来のJSON・効果レジストリ・状態・マーカー・コンボ・奥義管理を再利用しています。
侵色は既存marker_001。護彩はmarker_003（0〜30）、変換パッシブはpassive_010。
consumeMarkerが生存対象から実消費量を合計し、使用者自身のパッシブへ原因つきで通知します。
変換は合計の50%を切り捨て。他者による消費、単なるマーカー減少、浄化・解除は通知しないため対象外。

- 色喰らい：4倍数。最多侵色の敵を選択（同量は既存の敵並び順）。最大10消費後、100%＋実消費×5%。
- 染色捕食：6倍数。各生存敵から最大5消費後、全体80%＋合計×4%。護彩は対象別ではなく消費合計から丸めます。
- 護色反転：comboFromとcompletionEffectsを拡張したafterSkill連携。染色捕食で実消費10以上なら護彩獲得後の現在値で70%＋護彩×2%。追加ターン・攻撃回数・倍数再判定なし。元特技とコンボの両方のセットが必要。
- 万彩拒絶砲：既存selfMarkerAtLeastと2倍数のAND、oncePerBattleを再利用。30消費で全体390%、攻撃後に生存敵へ侵色+3（上限100）。

特技の発動優先順位は従来どおりセット順です。奥義を最優先にする場合は先頭へセットしてください。
コンボ・奥義・報復本能もセット枠に含みます。固有パッシブ護彩吸収はセット枠に含みません。

### 能力値と補完値

| 基礎値 | 値 | Lvごとの成長 |
|---|---|---|
| hp | 140 | 13 |
| mp | 64 | 4 |
| atk | 9 | 0.7 |
| def | 11 | 1 |
| matk | 24 | 2.2 |
| mdef | 17 | 1.5 |
| evasion | 0 | 0 |
| attackIntervalMs | 2600 | — |

これらはランク補正前の値です。強さ3・☆2の正式な既存個体はないため、
プリズマリア（強さ4・☆3）のHP168 / 魔攻27 / 魔防22より抑え、HPやや高・物攻低・魔攻高・魔防やや高・遅めに設定しました。
ソメイムHP82 / 魔攻19、イロワンHP98 / 魔攻9との比較でも単純上位の高速型にはしていません。
指定された特技倍率は変更していません。単独では侵色を供給できず、護彩30へ容易に到達できません。

| 特技ID | 名前 | 習得条件（AND） | MP |
|---|---|---|---|
| skill_045 | 色喰らい | ☆2 Lv1 | 6 |
| skill_046 | 魔力集中 | ☆2 Lv5 | 0 |
| skill_047 | 暗黒弾 | ☆2 Lv10 | 6 |
| skill_048 | 拒絶の構え | ☆2 Lv20 | 0 |
| skill_049 | 染色捕食 | ☆3 Lv1 | 14 |
| skill_050 | 生命吸収 | ☆3 Lv10 | 8 |
| skill_051 | 暗黒波 | ☆3 Lv20 | 14 |
| skill_052 | 報復本能 | ☆4 Lv1 | 0 |
| skill_053 | 護色反転 | ☆4 Lv30 | 0 |
| skill_054 | 奥義：万彩拒絶砲 | ☆5 Lv1 | 0 |

仮出現場所：enc_003（仮の丘）Lv5〜6・☆2、重み1。正式生息地は後からデータで移動可能。
加入率22%、失敗補正+5%、6回失敗後の次回確定。加入Lvは倒した敵のLv、初期☆2。
重複時item_009×5。ドロップitem_007×1（45%）、経験値30、ゴールド20。闇耐性0.5、光弱点1.5。

画像：img/monsters/mon_010.png、1536×1024、RGBA。
添付画像を編集対象に、imagegenの背景除去で市松模様と器官の穴の背景を透過しました。
指示：背景だけ除去し、元デザイン・全身・ポーズ・色・発光・縦横比を維持、切り抜きによる欠け・影・文字を追加しない。
PNGのアルファと周辺・器官間の透過を確認。プロジェクト画像には透過出力をそのまま採用。
生成による背景除去のため細部の完全なピクセル一致は保証できません。画像の配置は既存のimage参照とcontainを利用します。

## 6. 汎用特技の共通化

既存の全ユニット共通data/skills.jsonへ一度だけ登録し、learnsetはskillIdを参照します。
共有6種：skill_046 魔力集中 / skill_047 暗黒弾 / skill_048 拒絶の構え / skill_050 生命吸収 / skill_051 暗黒波 / skill_052 報復本能。
新しい専用マスターやリフューラIDでの分岐はありません。common:trueは識別用で、参照方式は従来どおりです。
通常攻撃反応・敵デバフ反応・次の攻撃ダメージ補正・実ダメージ吸収を汎用レジストリへ最小限追加しました。
魔法防御+15%・3ターンには既存status_015を再利用し、重複状態定義を作っていません。

## 7. 別モンスターで再利用する方法

learnsetへ、例えば `{"skillId":"skill_047","rank":2,"level":10}` を追加します。
戦闘処理をコピーする必要はありません。ランク・レベルだけを新モンスターに合わせて設定し、既存の5枠へセットします。
詳細はCOMMON_SKILLS.mdを参照。特技図鑑・使用者逆引きは同じ実データから自動反映します。
図鑑用に独立した倍率データは作っていません。追加効果の説明変換も実データを読んでいます。

## 8. 実行したテスト

- 実装前：npm run check（296件）。
- 実装後：npm run validate、npm test、npm run check。
- 新規tests/battle/refura.test.js（27件）。実消費・50%切捨て・上限・他者/浄化除外・最多対象・全体対象・コンボ条件・護彩参照タイミング・攻撃回数非加算・奥義条件/390%/消費/付与/1回制限。
- 共有IDの別ユニット実行、通常攻撃反応10%と3自身行動、デバフ反応20%と1行動1判定、無効/強化/味方除外、報復の非重複/全体適用/終了/非攻撃/全ミス、実ダメージ吸収・最大HP・オーバーキル・別コンボ除外。
- ランク/Lv習得AND・10習得/5セット・☆2加入・遭遇rank・画像パス/PNG形式・図鑑分類/逆引き・セーブ維持・seed再現。
- npm run sim -- --boss boss_001（各Lv40試行）。
- git diff --check、PNGアルファ確認、差分ZIPの構造/CRC/ファイル一覧照合、元mainへZIPを展開した状態で再検証。
- npm run e2e / npm run e2e:battleを試行。Chromiumの取得も試行。

## 9. テスト結果

データ検証成功。npm test・npm run checkは323件成功、失敗0（既存296＋追加27）。
ボス勝率：Lv3 0%、Lv5 0%、Lv8 100%、Lv10 100%、Lv15 100%。既存の記録と一致。
途中の2件の既存テスト失敗は、追加フックを既存検出テストへ登録し、新敵Lvを既存地点のLv5〜6帯に合わせて解消しました。
追加テストの小数比較・乱数関数の参照比較を適切な誤差/状態比較へ修正し、再実行して通過。
E2Eはブラウザ実行ファイルがなく、配布ZIP取得が壊れたファイルとなったためインストールできず未完了。
画面検証やiPhone実機確認の成功は報告していません。該当制約はdocs/TODO.mdにも記載。

## 10. ZIPに含めたファイル

以下25ファイルのみ。リポジトリルート相対のパスをそのまま使い、余計な親フォルダはありません。

- `.github/workflows/unzip.yml`
- `data/encounters.json`
- `data/markers.json`
- `data/monsters.json`
- `data/passives.json`
- `data/skills.json`
- `data/species.json`
- `data/statuses.json`
- `docs/COMMON_SKILLS.md`
- `docs/HANDOFF.md`
- `docs/REFURA_IMPLEMENTATION.md`
- `docs/TODO.md`
- `img/monsters/mon_010.png`
- `src/battle/effects.js`
- `src/battle/engine.js`
- `src/battle/eventTriggers.js`
- `src/battle/passives.js`
- `src/battle/statusEffects.js`
- `src/codex/abilities.js`
- `src/core/schema.js`
- `src/exploration/encounters.js`
- `src/progression/units.js`
- `src/ui/battleDetail.js`
- `tests/battle/engine.test.js`
- `tests/battle/refura.test.js`

node_modules・Git管理情報・ログ・スクリーンショット・依存コピー・作業スクリプトは含みません。
新しいコードのimport先、JSON参照、画像、ドキュメントを確認しました。削除対象はありません。

## 11. 自動解凍・反映時の注意

ZIPをリポジトリルートへ上書き展開します。基準SHAより後に同じファイルが変更されている場合は、上書き前に差分を確認してください。

**現在のGitHub Actionsを使う場合、先に.github/workflows/unzip.ymlだけを更新する必要があります。**
現行workflowは `/tmp/up/shisou-sekai-rpg/` をコピーする旧形式で、今回指定されたルート直下ZIPを読めません。
修正版workflowはこのZIPに含みますが、旧workflowが先に実行されるため、ZIP内の修正だけでは初回の読み方を変更できません。
ご自身の別の自動解凍機構がすでにルート相対ZIP対応なら、その機構で直接反映できます。
修正版workflowはREADME削除を廃止し、ルート相対コピー、DELETE_FILES.txtの安全なファイル削除、変更なし時のcommit省略に対応。
今後削除一覧を含むZIPでは、ZIP内にいないだけでは削除されません。今回の削除一覧は不要です。
複数ZIPをリポジトリルートへ置かないでください（既存の最初のZIPを選ぶ規則は維持しています）。
反映後はnpm run checkを実行し、ブラウザの再読み込みを行ってください。セーブ初期化は不要、saveVersionは3のままです。
護彩・報復は既存戦闘状態内の一時データで、セーブ形やマイグレーションは変更していません。

## 12. スマートフォン実機で確認する項目

- iPhone SE / Safariの375px幅で、現行3対3の画像全身・名前・HP/MP・侵色/護彩が重ならないこと。
- 図鑑・編成・戦闘で画像が読み込まれ、市松模様が残らず、耳・爪・尻尾の欠けや縦横比の崩れがないこと。
- 初期☆2と習得条件、5枠セット、固有パッシブと報復本能の枠の違い。
- ソメイム等と組んで侵色消費→護彩増加、護色反転・万彩拒絶砲・侵色+3の表示が一致すること。
- 拒絶の構え・魔力集中の残り自身行動、報復の「次の攻撃」表示と解除。
- ユニット詳細・特技図鑑・ログから共有IDの情報と使用者を確認できること。
- 速度×1/×2/×3、詳細/ログを開いた時の一時停止、画面復帰、リロード後の既存セーブの継続。

機能の未実装はありません。正式生息地は仮配置、画面E2E・実機確認は上記理由で未完了です。
