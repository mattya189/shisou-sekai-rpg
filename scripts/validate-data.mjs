/**
 * data/ 以下のJSONを検証する。コンテンツを追加したら必ず実行する。
 *   npm run validate
 * エラーがあれば終了コード1。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGameData } from '../src/core/gameData.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const data = await loadGameData(async (p) => {
    const text = await readFile(path.join(root, p), 'utf8');
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`${p} のJSONが不正です: ${e.message}`);
    }
  }, 'data/');
  const { errors, warnings } = data.validate();
  for (const w of warnings) console.warn(`警告: ${w}`);
  for (const e of errors) console.error(`エラー: ${e}`);
  const counts = Object.entries(data.index).map(([k, m]) => `${k}:${m.size}`).join(' ');
  console.log(`件数 ${counts}`);
  if (errors.length) {
    console.error(`\nデータ検証に失敗しました（エラー ${errors.length} 件）`);
    process.exit(1);
  }
  console.log(`データ検証OK（警告 ${warnings.length} 件）`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
