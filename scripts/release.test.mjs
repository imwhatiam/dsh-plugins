import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bumpVersion, tagFor, ensureChangelogHeader, applyRelease } from './release.mjs'

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

test('applyRelease updates package, compat, changelog, and README', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-'))
  try {
    mkdirSync(join(root, 'packages', 'dsh-mosaic'), { recursive: true })
    mkdirSync(join(root, 'docs', 'verification'), { recursive: true })
    writeFileSync(join(root, 'packages', 'dsh-mosaic', 'package.json'), JSON.stringify({
      name: 'dsh-mosaic', version: '1.1.4', engines: { dsh: '>=0.2.1-rc.1 <0.3.0-0' },
    }, null, 2))
    writeFileSync(join(root, 'packages', 'dsh-mosaic', 'CHANGELOG.md'), '# Changelog\n\n## 1.1.4\n')
    writeFileSync(join(root, 'dsh-compat.json'), JSON.stringify({
      dsh: '0.2.2-rc.1',
      verifiedAt: '2026-11-05',
      packages: { 'dsh-mosaic': { version: '1.1.4', engines: '>=0.2.1-rc.1 <0.3.0-0' } },
    }, null, 2))
    writeFileSync(join(root, 'README.md'), '# dsh-plugins\n\n<!-- compat:begin -->\nold\n<!-- compat:end -->\n')

    const result = applyRelease({ root, packageName: 'dsh-mosaic', bump: 'patch', date: '2026-11-05' })

    assert.equal(result.to, '1.1.5')
    assert.equal(JSON.parse(readFileSync(join(root, 'packages', 'dsh-mosaic', 'package.json'), 'utf8')).version, '1.1.5')
    assert.match(readFileSync(join(root, 'README.md'), 'utf8'), /1\.1\.5/)
    assert.ok(result.files.includes(join(root, 'README.md')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
