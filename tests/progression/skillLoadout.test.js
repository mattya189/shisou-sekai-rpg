import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnedSkillIds, setEquippedSkills, equipSkill, unequipSkill, moveSkill, upcomingSkills } from '../../src/progression/skillLoadout.js';
import { setLevel } from '../../src/progression/leveling.js';
import { newGameFixture } from '../helpers.js';

test('習得済み特技はレベルで決まる', async () => {
  const { data, save } = await newGameFixture();
  setLevel(save, data, 'chr_001', 8);
  assert.deepEqual(learnedSkillIds(data, save.units.chr_001), ['skill_001', 'skill_002', 'skill_014', 'skill_007']);
  assert.deepEqual(upcomingSkills(data, save.units.chr_001).map((l) => l.skillId), ['skill_011', 'skill_010']);
});

test('extraSkills で覚えた特技も習得済みに含まれる', async () => {
  const { data, save } = await newGameFixture();
  save.units.chr_001.extraSkills = ['skill_003'];
  assert.ok(learnedSkillIds(data, save.units.chr_001).includes('skill_003'));
});

test('セットは5個まで', async () => {
  const { data, save } = await newGameFixture();
  save.units.chr_001.extraSkills = ['skill_003', 'skill_004', 'skill_005', 'skill_006'];
  const six = learnedSkillIds(data, save.units.chr_001).slice(0, 6);
  assert.equal(six.length, 6);
  assert.throws(() => setEquippedSkills(save, data, 'chr_001', six), /5個まで/);
  setEquippedSkills(save, data, 'chr_001', six.slice(0, 5));
  assert.equal(save.units.chr_001.equippedSkills.length, 5);
});

test('未習得・重複はセットできない', async () => {
  const { data, save } = await newGameFixture();
  assert.throws(() => equipSkill(save, data, 'chr_001', 'skill_010'), /習得していません/);
  assert.throws(() => equipSkill(save, data, 'chr_001', 'skill_001'), /重複/);
});

test('優先順位を並べ替えられる', async () => {
  const { data, save } = await newGameFixture();
  setLevel(save, data, 'chr_001', 20);
  // 6個習得しているが、セットは先頭から5個まで
  assert.deepEqual(save.units.chr_001.equippedSkills, ['skill_001', 'skill_002', 'skill_014', 'skill_007', 'skill_011']);
  moveSkill(save, 'chr_001', 4, 0);
  assert.deepEqual(save.units.chr_001.equippedSkills, ['skill_011', 'skill_001', 'skill_002', 'skill_014', 'skill_007']);
  moveSkill(save, 'chr_001', 0, 1);
  assert.deepEqual(save.units.chr_001.equippedSkills, ['skill_001', 'skill_011', 'skill_002', 'skill_014', 'skill_007']);
  assert.throws(() => moveSkill(save, 'chr_001', 0, 9));
});

test('外すことができる', async () => {
  const { data, save } = await newGameFixture();
  unequipSkill(save, data, 'chr_001', 'skill_001');
  assert.deepEqual(save.units.chr_001.equippedSkills, ['skill_002']);
});
