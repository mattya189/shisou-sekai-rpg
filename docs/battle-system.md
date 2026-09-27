# 戦闘システム（攻撃回数型リアルタイム自動戦闘）

> **状態**: Phase 3 で実装済み。ボス機能は Phase 7 で実装済み（`src/battle/engine.js`、戦闘画面 `src/ui/screens/battle.js`）。
> 開発環境ではデバッグパネルの「任意の戦闘」から、編成中のパーティで好きな敵と戦える。
> ボス・BREAK・大技予兆は Phase 7。戦闘後の報酬・加入・HPの持ち越しは [exploration-system.md](exploration-system.md) の「戦闘後」。

## 基本の流れ

各ユニットは「行動間隔」「ターン数」「攻撃回数」を個別に持つ。従来のターン制ではない。

```
行動可能時間になる
  → そのユニットのターン数 +1
  → セットされた特技（最大5個）を優先順位の高い順に確認
      発動条件を満たす かつ MPが足りる → その特技を1つだけ使う（MP消費）
      条件を満たすがMP不足 → 次の優先順位の特技を確認
  → 使える特技が無ければ通常攻撃（成功時、最大MPの5%を回復）
  → 攻撃として成立した場合だけ攻撃回数 +1
```

例（攻撃間隔2秒、「2の倍数回目」の特技をセット）: 2秒=通常攻撃、4秒=特技、6秒=通常攻撃、8秒=特技。

- 優先順位 = `unit.equippedSkills` の並び順（先頭が最優先）。プレイヤーが編成画面で並べ替える。
- 通常フィールド戦闘では、戦闘終了後にMPを全回復する。連戦ダンジョンではHP/MPを次戦へ持ち越せるようにする。
- 敵側は基本的にMPを必要としない。
- 数値は `data/balance.json`（`normalAttack.power`, `normalAttack.mpRecoverPctOfMax`, `minAttackIntervalMs`）。

## 「ターン」の正式定義

**1ターン = そのユニットが1回行動すること**。味方全員と敵全員の一巡ではなく、各ユニットが個別にターンを持つ。

| カウンター | 増える条件 | 用途 |
|---|---|---|
| `turnCount` | そのユニットが行動したとき。攻撃・回復・防御・構え・チャージ・お絵描き・待機・特殊行動を含む | 「3ターン継続」など、対象自身の行動回数 |
| `attackCount` | 通常攻撃、または攻撃扱いの特技が成立したとき | 「2の倍数回」「3回ごと」などの特技条件・攻撃回数パッシブ |

- 攻撃行動では `turnCount` と `attackCount` が1ずつ進む。
- 非攻撃行動では `turnCount` だけが進む。特技データに `"countsAsAttack": false` を指定する。省略時は既存互換のため攻撃扱い。
- 高速ユニットは低速ユニットより短時間に多く行動するため、ターン制の効果を早く消費する。これは仕様。
- 攻撃回数条件は `turnCount` を参照しない。攻撃行動は「今回成立する攻撃回数」、非攻撃行動は「成立済みの攻撃回数」で判定する。
- 非攻撃特技は、同じ攻撃回数候補のまま無限に連発しない。一度使うと、実際の攻撃が1回成立するまで同じ特技を再候補にしない。
- ボスの大技予兆（チャージ）は1ターンを使う非攻撃行動。予兆後の大技が成立した時点で攻撃回数が進む。

例: 「2ターン継続。行動するたび最大HPの10%を失う」は、対象の1回目の行動で10%減少・残り1ターン、
2回目の行動でさらに10%減少して終了する。他ユニットの行動数や経過秒数には左右されない。

## エンジンの仕組み

```js
import { createBattle, advance, runToEnd, battleResult } from './src/battle/engine.js';
const battle = createBattle(data, { allies, enemies, seed: 42, mode: 'field' });
advance(battle, data, 16);   // 16ミリ秒進める（画面は毎フレーム呼ぶ）
runToEnd(battle, data);      // 決着まで一気に進める（テスト・将来の自動周回）
battleResult(battle);        // { outcome, timeMs, allies: [{ hp, mp, ... }], defeatedEnemies }
```

- **出来事を時刻順に処理する方式**: 各ユニットの攻撃、状態異常の継続ダメージ、効果切れを「発生時刻つきの出来事」として
  早い順に1つずつ処理する。`advance` に渡す時間の刻み方で結果は変わらない。
  画面の ×1 / ×2 / ×3 は実時間に掛ける倍率を変えているだけなので、**速度を変えても結果は同じ**（テストで確認済み）。
- **同時刻の順番**: 時間基準の継続ダメージ → 効果切れ → 行動。同じ種類なら味方（編成順）→ 敵（並び順）。
- **乱数は battle.rng だけ**。seed が同じなら結果は完全に同じ。開発環境では結果画面に seed を表示し、
  デバッグパネルで同じ seed を指定すれば同じ展開を再現できる。
- エンジンは DOM に依存しない。画面は `battle` の状態を描画するだけ。
- 戦闘ログはイベントの配列。文章化は `src/ui/battleLog.js` だけで行う。

| ログの type | 内容 |
|---|---|
| `start` / `end` | 開始 / 決着（`outcome`: `won` `lost` `timeout`） |
| `action` | 1回の行動。`kind`、`skillId`、`turnCount`、`attackCount`、`countsAsAttack`、`skippedForMp`（MP不足で見送った特技）、`results` |
| `statusTick` | 状態異常の継続ダメージ |
| `statusEnd` | 状態異常が治った |

`results` の要素: `damage` `miss` `heal` `mpRecover` `statusApplied` `statusRefreshed` `statusResisted`
`markerChanged` `markerCollected` `effectsScheduled` `scheduledEffectsCompleted` `defeat`

## 対象の選び方

- 味方は**先頭の敵**を狙う（集中攻撃。倒したら次の敵へ）
- 敵は味方を**ランダム**に狙う（戦闘の rng を使うので再現可能）
- 「敵のHPが○%以下」「敵が毒状態」などの条件は、この「今回の主な攻撃対象」を見て判定する

## ダメージ・回復（`src/battle/damage.js`）

```
ダメージ = 攻撃力 × 威力 × K / (K + 防御力)
         × 属性倍率（受ける側の elementMultipliers）
         × 乱数（1 ± damageVariance）
         × (1 + パッシブのダメージ増加%)
         四捨五入・最低1           K = balance.battle.defenseConstant
回復量   = 攻撃力 × 威力（切り捨て・最低1）
```

攻撃力・防御力は、状態異常（攻撃ダウンなど）とパッシブ（場慣れなど）を反映した値。
通常攻撃は属性なし・威力 `normalAttack.power`。

## 決着

- 敵が全員倒れたら勝利、味方が全員倒れたら敗北
- `balance.battle.timeLimitMs`（仮 5分）を過ぎたら時間切れ
- `mode: 'field'` の結果は MP を全回復した値、`'dungeon'` は持ち越し。HPはどちらも持ち越し（フィールドでは宿屋で回復）

## 発動条件（`src/battle/conditions.js`）

| type | パラメータ | 意味 |
|---|---|---|
| `always` | – | 毎回 |
| `attackCountMultiple` | `n` | 攻撃回数が n の倍数 |
| `attackCountEvery` | `n`, `start`(省略時 n) | start 回目から n 回ごと |
| `selfHpBelow` | `pct` | 自分のHPが pct% 以下 |
| `allyHpBelow` | `pct` | HPが pct% 以下の味方がいる |
| `enemyHpBelow` | `pct` | 敵のHPが pct% 以下 |
| `enemyHasStatus` | `statusId` | 敵が特定の状態異常 |
| `selfMissingStatus` | `statusId` | 自分が特定の状態ではない |
| `randomChance` | `chance`（0〜1） | 戦闘seedで再現可能な確率判定 |
| `enemyMarkerAtLeast` | `markerId`, `stacks` | 指定量以上のマーカーを持つ敵がいる |
| `enemyMarkerTotalAtLeast` | `markerId`, `stacks` | 敵全体のマーカー合計が指定量以上 |
| `enemyBreak` | – | 敵がBREAK中 |
| `enemyCharging` | – | 敵が大技を準備中 |
| `all` / `any` | `of`: 条件の配列 | 複合条件（かつ / または） |

新しい条件は `CONDITIONS` に1件追加する（`params`・`describe`・`check`）。

## 特技効果（`src/battle/effects.js`）

新しい効果は `EFFECTS` に `params` と `apply(effect, api, act)` を追加する。

| type | 主なパラメータ |
|---|---|
| `damage` | `target`, `power`, `hits`（多段）, `damageType`（`physical` / `magic`）, 特技側の `element` |
| `heal` | `target`, `power` |
| `applyStatus` | `target`, `statusId`, `chance` |
| `markerScaledDamage` | `target`, `basePower`, `markerId`, `powerPerStack`, `damageType` |
| `addMarker` | `target`, `markerId`, `amount` または `min` / `max` |
| `collectMarker` | `markerId`（最多の敵。同数なら敵の並び順先頭） |
| `scheduleEffects` | `afterTurns`, `effects`（指定した次回以降の行動開始時に解決） |

対象（`target`）: `enemySingle` `enemyAll` `self` `allyLowestHp` `allyAll`

## 固有パッシブ（`src/battle/passives.js`）

1ユニット1〜2個。`static: true` の効果（例 `flatStatPct`）は戦闘外の能力値計算にも反映される。
戦闘中の処理はフック（`onAttackStart` `afterNormalAttackHit` `statPct` `damagePct` `normalAttackMpPct` `afterAction`）で書く。

| type | パラメータ |
|---|---|
| `statPerAttackCount` | `stat`, `pctPerStack`, `maxStacks` |
| `normalAttackMpBonus` | `pctOfMaxMp` |
| `healEveryNAttacks` | `n`, `pctOfMaxHp` |
| `damageVsStatus` | `pct`, `statusId`（省略時は何らかの状態異常） |
| `flatStatPct` | `stat`, `pct`（static） |
| `normalAttackMarker` | `markerId`, `amount`（通常攻撃命中時だけ付与） |

## 状態異常（`data/statuses.json`）

`kind` ごとの処理は `src/battle/statusEffects.js`:

| kind | params | 処理 |
|---|---|---|
| `damageOverTime` | `pctOfMaxHp`, `tickMs` | tickMs ごとに最大HPの pct% のダメージ |
| `attackDelay` | `delayMs` | かかった瞬間と効果中の攻撃間隔を delayMs のばす |
| `statModifier` | `stat`, `pct` | 能力値を pct% 増減 |
| `flatStatModifier` | `stat`, `amount` | 能力値を固定値で増減（回避率など） |
| `multiStatModifier` | `statPct`, `intervalPct` | 複数能力と行動間隔をまとめて割合増減 |
| `intervalPctModifier` | `pct` | 行動間隔を割合で増減（正なら遅くなる） |
| `additionalNormalAttack` | `target`, `power`, `damageType` など | 通常攻撃直前の追加攻撃。攻撃回数は増えない |

継続基準は状態効果データごとに次のどちらか一方を指定する。

- `durationMs`: 経過時間（ミリ秒）基準。
- `durationTurns`: 対象ユニットの行動回数基準。`turnTiming` は `actionStart` または `actionEnd`（省略時）を指定できる。

ターン基準の継続ダメージは指定タイミングで効果を処理してから残りターンを1減らす。
付与した行動自身は継続ターンに数えず、対象の次の行動から数える。同じ状態異常にもう一度かかると、
残り時間または残りターンが初期値へ更新される（重ねがけはしない）。

## 蓄積マーカー・予約効果・コンボ

- 蓄積マーカーは `data/markers.json` に定義し、戦闘中は各対象の `markers[markerId]` へ個別保存する。必ず `maxStacks` で上限を設ける。状態異常とは別で、単独の時間切れや能力低下はない。
- ランダムなスタック付与も `battle.rng` を使う。敵全体への `min` / `max` 付与は敵ごとに個別抽選され、同じseedで再現できる。
- `scheduleEffects` は効果を予約し、`afterTurns: 1` なら使用者の次の行動開始時に完成させる。完成処理の後も、その行動の特技選択・通常攻撃を続ける。
- コンボ特技は `comboFrom` と `completionEffects` を持つ。コンボ元が予約した完成時だけ効果を足し、通常の優先順位候補にはならない。コンボ元とコンボ特技の両方がセットされている場合だけ有効。
- `oncePerBattle: true` の特技は、発動後に同じ戦闘では候補から外れる。
- 通常攻撃直前の追加攻撃は同一行動内の処理であり、`attackCount` を追加で増やさない。

## 物理・魔法・回避（後方互換）

`damageType: "magic"` は `matk` / `mdef`、それ以外は `atk` / `def` を使う。旧ユニットが `matk` / `mdef` を省略した場合はそれぞれ `atk` / `def` へフォールバックする。`evasion` は省略時0で、0なら既存戦闘と同じく命中判定の乱数を消費しない。

## 属性

`data/elements.json`（無・仮の火水風・氷）。ユニットの `elementMultipliers` で被ダメージ倍率を持つ（1.5=弱点、0.5=耐性）。

## ボス（`bosses.json`、Phase 7）

敵の spec に `{ bossId: 'boss_001' }` を渡すとボスになる。ボスも攻撃回数型で行動し、MPは使わない。

| 仕組み | データ | 動き |
|---|---|---|
| 大技予兆 | `charge: { skillId, everyNAttacks, chargeMs, message }` | N回目の攻撃のたびに攻撃せず力をため（`charging`、ログ `chargeStart`）、chargeMs 後に大技を必ず放つ。味方の「敵が大技準備中」条件が有効になる |
| BREAK | `breakGauge: { max, durationMs, damageTakenPct }` | 攻撃が当たるたびにゲージが減る（1ヒット1、特技効果の `breakPower` で増やせる）。0で BREAK：行動不能、被ダメージ増加、ため中の大技は中断。時間で回復しゲージも満タンに戻る |
| フェーズ | `phases: [{ hpBelowPct, skills, statPct, message }]` | HPが割合以下になると特技の入れ替え・能力増減 |
| 時間経過ギミック | `gimmicks: [{ atMs, statPct, message }]` | 戦闘開始から atMs で能力増減（怒り状態など） |
| 部位 | `parts: [{ key, name, hpPct, def, onDestroy: { removeSkills, statPct, message } }]` | 本体の前に並ぶ別の敵。味方は先頭から狙うので部位から攻撃する。壊すと本体の特技を封印・能力を下げる。**部位を倒さなくても本体を倒せば勝ち** |
| 状態異常耐性 | `statusImmune: [statusId]` | その状態異常にかからない |
| 能力補正 | `statMultiplier: { hp: 4, atk: 1.3 }` | 元のモンスターの能力に掛ける |

部位は経験値・ドロップ・図鑑の撃破数の対象にならない。
「敵がBREAK中」「敵が大技準備中」の条件は、部位を狙っているときも本体の状態で判定する。

### ボスの報酬と特殊加入

- `rewards: { gold, items }` は倒すと必ずもらえる。`defeatFlag` のフラグが立つ。
- `recruit: { chance, conditions: [...], hint }`: 条件をすべて満たして倒すと、chance の確率で仲間になる（モンスターは `recruit.special: true`）。
  条件の種類（`src/game/battleOutcome.js` の `BOSS_RECRUIT_CONDITIONS`）:
  `breakCount`（BREAK回数 min 以上）、`partsDestroyed`（部位破壊数 min 以上）、`withinMs`（ms 以内に撃破）、`noAllyDown`（誰も倒れずに撃破）
- 条件を満たさずに倒すと `hint` が結果画面に出る。
