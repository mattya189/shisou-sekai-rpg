import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPauseController } from '../../src/ui/battlePause.js';

function clock() {
  let t = 0;
  return { now: () => t, tick: (ms) => { t += ms; } };
}

test('詳細を開くと止まり、閉じると再開する', () => {
  const p = createPauseController();
  assert.equal(p.isRunning(), true);
  p.openPanel('detail');
  assert.equal(p.isRunning(), false);
  p.closePanel();
  assert.equal(p.isRunning(), true);
});

test('手動停止中にパネルを開閉しても停止のまま', () => {
  const p = createPauseController();
  p.toggleManual();
  p.openPanel('log');
  p.closePanel();
  assert.equal(p.isRunning(), false);
  assert.equal(p.isManuallyPaused(), true);
  p.toggleManual();
  assert.equal(p.isRunning(), true);
});

test('詳細からログへの切り替えで一瞬も再開しない', () => {
  const c = clock();
  const p = createPauseController({ now: c.now });
  const resumes = [];
  p.onResume((ms) => resumes.push(ms));
  p.openPanel('detail');
  c.tick(500);
  p.openPanel('log');
  assert.equal(p.isRunning(), false);
  assert.equal(p.panel(), 'log');
  assert.deepEqual(resumes, []);
  c.tick(700);
  p.closePanel();
  assert.deepEqual(resumes, [1200]);
});

test('勝敗確定後はパネルの開閉で再開しない', () => {
  const p = createPauseController();
  const resumes = [];
  p.onResume(() => resumes.push(1));
  p.markOver();
  p.openPanel('log');
  p.closePanel();
  assert.equal(p.isRunning(), false);
  assert.deepEqual(resumes, []);
});

test('停止時間は通知されるだけで、戦闘へまとめて渡す口はない', () => {
  const c = clock();
  const p = createPauseController({ now: c.now });
  let paused = 0;
  p.onResume((ms) => { paused += ms; });
  p.toggleManual();
  c.tick(5000);
  p.toggleManual();
  assert.equal(paused, 5000);
  assert.equal(p.isRunning(), true);
});
