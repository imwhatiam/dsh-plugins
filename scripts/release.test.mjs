import assert from 'node:assert/strict'
import test from 'node:test'
import { bumpVersion, tagFor, ensureChangelogHeader } from './release.mjs'

test('bumpVersion handles patch, minor, and major', () => {
  assert.equal(bumpVersion('1.1.4', 'patch'), '1.1.5')
  assert.equal(bumpVersion('1.1.4', 'minor'), '1.2.0')
  assert.equal(bumpVersion('1.1.4', 'major'), '2.0.0')
})

test('tagFor only tags the published package', () => {
  assert.equal(tagFor('dsh-mosaic', '1.1.5'), 'v1.1.5')
  assert.equal(tagFor('dsh-superpowers', '1.0.2'), null)
  assert.equal(tagFor('dsh-view-background-jobs', '0.1.1'), null)
})

test('ensureChangelogHeader inserts a missing version header', () => {
  const text = '# Changelog\n\n## 1.1.4\n\n- old\n'
  const next = ensureChangelogHeader(text, '1.1.5', '2026-11-05')
  assert.match(next, /^# Changelog\n\n## 1\.1\.5 — 2026-11-05\n/)
  assert.equal(ensureChangelogHeader(next, '1.1.5', '2026-11-05'), next)
})
