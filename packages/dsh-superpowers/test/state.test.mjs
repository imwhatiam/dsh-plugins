import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPluginState } from '../lib/state.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS = join(ROOT, 'skills');
const BROKEN_SKILLS = join(ROOT, 'test', 'fixtures', 'broken-skills');
const MIXED_SKILLS = join(ROOT, 'test', 'fixtures', 'mixed-skills');
const MISSING_SKILLS = join(ROOT, 'test', 'fixtures', 'no-skills-here');
const MISSING_ROOT = join(ROOT, 'test', 'fixtures', 'no-adapter-here');

function load(skillsDir, rootDir = ROOT) {
  const errors = [];
  const state = loadPluginState({ skillsDir, rootDir, onError: (part, error) => errors.push([part, error]) });
  return { state, errors, parts: errors.map(([part]) => part) };
}

test('the shipped tree yields the full catalog and the bootstrap text', () => {
  const { state, errors } = load(SKILLS);

  assert.deepEqual(errors, []);
  assert.equal(state.catalog.length > 0, true);
  assert.equal(state.catalog.every((skill) => skill.source === 'bundled'), true);
  assert.equal(state.catalog.every((skill) => skill.provider === 'superpowers'), true);
  assert.equal(typeof state.catalog[0].rank, 'number');
  assert.match(state.bootstrap, /<DSH_PLATFORM_ADAPTER>/u);
});

test('a broken skill is dropped while its healthy siblings still load', () => {
  const { state, parts, errors } = load(MIXED_SKILLS);

  assert.deepEqual(state.catalog.map((skill) => skill.name), ['good-skill']);
  assert.deepEqual(parts.filter((part) => part.startsWith('skill:')), ['skill:broken-skill']);
  assert.match(errors[0][1].message, /frontmatter/u);
});

test('a tree where every skill is broken still returns an empty catalog', () => {
  const { state, parts } = load(BROKEN_SKILLS);

  assert.deepEqual(state.catalog, []);
  assert.deepEqual(parts, ['skill:broken', 'bootstrap']);
});

test('an unreadable skills directory is reported once instead of throwing', () => {
  const { state, parts } = load(MISSING_SKILLS);

  assert.deepEqual(state.catalog, []);
  assert.equal(parts[0], 'catalog');
  assert.equal(state.bootstrap, undefined);
});

test('a missing adapter keeps the catalog and drops only the bootstrap', () => {
  const { state, parts, errors } = load(SKILLS, MISSING_ROOT);

  assert.equal(state.catalog.length > 0, true, 'the catalog does not depend on the adapter files');
  assert.equal(state.bootstrap, undefined);
  assert.deepEqual(parts, ['bootstrap']);
  assert.equal(errors[0][1].code, 'ENOENT');
});
