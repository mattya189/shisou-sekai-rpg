import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeEvent } from '../../src/ui/battleLog.js';
import { createBattle, runToEnd } from '../../src/battle/engine.js';
import { loadBattleData } from '../helpers.js';

test('戦闘ログのすべてのイベントを文章にできる', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, {
    allies: [{ defId: 'chr_900', skills: ['skill_900', 'skill_002', 'skill_003'] }, { defId: 'mon_001' }],
    enemies: [{ defId: 'mon_001', level: 5 }, { defId: 'mon_003', level: 5 }],
    seed: 7,
  });
  runToEnd(b, data);
  for (const ev of b.log) {
    const text = describeEvent(ev, b, data);
    assert.equal(typeof text, 'string');
    assert.ok(!text.includes('undefined'), text);
  }
});

test('味方と同じ名前の敵は「敵の」で区別する', async () => {
  const data = await loadBattleData();
  const b = createBattle(data, { allies: [{ defId: 'mon_001' }], enemies: [{ defId: 'mon_001' }], seed: 1 });
  runToEnd(b, data);
  const lines = b.log.map((e) => describeEvent(e, b, data)).join('\n');
  assert.match(lines, /敵の（仮）ためいきスライム/);
});
