/**
 * バランス確認ツール: 開始時のパーティ（balance.newGame）をレベルごとに戦わせ、勝率と平均戦闘時間を出す。
 *
 *   npm run sim -- --boss boss_001
 *   npm run sim -- --enemies mon_004:8,mon_003:7 --levels 3,5,8,10 --runs 60
 *   npm run sim -- --boss boss_001 --rank 2
 *
 * オプション
 *   --boss <bossId>            ボスと戦う
 *   --enemies <id:lv,...>      敵を指定（最大3体）
 *   --levels <n,n,...>         パーティのレベル（既定 3,5,8,10,15）
 *   --rank <n>                 パーティのランク（既定 1）
 *   --runs <n>                 レベルごとの試行回数（既定 40、seed は 1〜n）
 * 注意: HP満タン・MP満タンから始めた結果。連戦ダンジョンの後半はこれより厳しくなる。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGameData } from '../src/core/gameData.js';
import { createRng } from '../src/core/rng.js';
import { createNewGame } from '../src/game/newGame.js';
import { setLevel, setRank } from '../src/progression/leveling.js';
import { alliesFromParty } from '../src/battle/setup.js';
import { createBattle, runToEnd } from '../src/battle/engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);

const data = await loadGameData(async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8')), 'data/');
let enemies;
if (args.boss) enemies = [{ bossId: args.boss }];
else if (args.enemies) enemies = args.enemies.split(',').map((s) => { const [defId, lv] = s.split(':'); return { defId, level: Number(lv) || 1 }; });
else {
  console.log('使い方: npm run sim -- --boss boss_001  または  --enemies mon_004:8,mon_003:7');
  process.exit(1);
}
const levels = (args.levels ?? '3,5,8,10,15').split(',').map(Number);
const runs = Number(args.runs ?? 40);
const rank = Number(args.rank ?? 1);

console.log(`敵: ${enemies.map((e) => e.bossId ?? `${e.defId} Lv${e.level}`).join(', ')}　試行 ${runs}回/レベル　ランク${rank}`);
for (const lv of levels) {
  let wins = 0;
  let time = 0;
  let timeouts = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const save = createNewGame(data, createRng(seed));
    for (const id of save.party) if (id) { setLevel(save, data, id, lv); setRank(save, data, id, rank); }
    const b = runToEnd(createBattle(data, { allies: alliesFromParty(save, data), enemies, seed }), data);
    if (b.outcome === 'won') wins++;
    if (b.outcome === 'timeout') timeouts++;
    time += b.timeMs;
  }
  const pct = Math.round((wins / runs) * 100);
  const bar = '■'.repeat(Math.round(pct / 10)).padEnd(10, '・');
  console.log(`Lv${String(lv).padStart(3)}  ${bar} 勝率 ${String(pct).padStart(3)}%　平均 ${(time / runs / 1000).toFixed(1)}秒${timeouts ? `　時間切れ ${timeouts}` : ''}`);
}
