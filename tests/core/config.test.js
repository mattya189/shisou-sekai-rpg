import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDebugEnabled, CONFIG } from '../../src/config.js';

test('デバッグ機能は開発環境でだけ有効', () => {
  assert.equal(isDebugEnabled({ hostname: 'localhost' }), true);
  assert.equal(isDebugEnabled({ hostname: '192.168.0.10' }), true);
  assert.equal(isDebugEnabled({ hostname: 'example.github.io' }), false);
  assert.equal(isDebugEnabled({ hostname: 'shisou.pages.dev' }), false);
});

test('mode で強制的に切り替えられる', () => {
  assert.equal(isDebugEnabled({ hostname: 'example.com' }, { ...CONFIG.debug, mode: 'on' }), true);
  assert.equal(isDebugEnabled({ hostname: 'localhost' }, { ...CONFIG.debug, mode: 'off' }), false);
});
