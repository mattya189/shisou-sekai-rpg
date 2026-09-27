import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectValues } from '../../src/core/paths.js';

const obj = {
  worldId: 'world_001',
  passives: ['passive_001', 'passive_002'],
  learnset: [{ skillId: 'skill_001' }, { skillId: 'skill_002' }],
  elementMultipliers: { elem_002: 1.5 },
  trigger: { type: 'all', of: [{ statusId: 'status_001' }, { type: 'x' }] },
};

test('パス記法で値を集められる', () => {
  assert.deepEqual(collectValues(obj, 'worldId'), ['world_001']);
  assert.deepEqual(collectValues(obj, 'passives[]'), ['passive_001', 'passive_002']);
  assert.deepEqual(collectValues(obj, 'learnset[].skillId'), ['skill_001', 'skill_002']);
  assert.deepEqual(collectValues(obj, 'elementMultipliers{}'), ['elem_002']);
  assert.deepEqual(collectValues(obj, 'trigger.of[].statusId'), ['status_001']);
  assert.deepEqual(collectValues(obj, 'missing.path'), []);
});
