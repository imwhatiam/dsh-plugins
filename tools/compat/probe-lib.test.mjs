import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProfileManifest, parseDumpConfigRows, assertBundleRows, parseWebUrl, assertWebProfile, assertRequestedVersion } from './probe-lib.mjs'

test('buildProfileManifest adds file dependencies and keeps web bundles', () => {
  const template = {
    name: 'dsh-profile-probe',
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }
  const next = buildProfileManifest(template, [
    { name: 'dsh-mosaic', tarball: '/tmp/dsh-mosaic-1.1.4.tgz' },
  ])
  assert.deepEqual(next.dependencies, { 'dsh-mosaic': 'file:/tmp/dsh-mosaic-1.1.4.tgz' })
  assert.deepEqual(next.dsh.profile.bundles, [
    '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-mosaic',
  ])
  assert.equal(next.name, template.name)
})

test('buildProfileManifest does not duplicate a bundle', () => {
  const template = { dependencies: {}, dsh: { profile: { bundles: ['dsh-mosaic'] } } }
  const next = buildProfileManifest(template, [{ name: 'dsh-mosaic', tarball: '/x.tgz' }])
  assert.deepEqual(next.dsh.profile.bundles, ['dsh-mosaic'])
})

test('parseDumpConfigRows reads id and quoted name lines', () => {
  const text = [
    '- id: mosaic',
    "  name: 'dsh-mosaic'",
    '- id: superpowers',
    "  name: 'dsh-superpowers'",
    '- id: background-jobs',
    "  name: 'dsh-view-background-jobs'",
  ].join('\n')
  assert.deepEqual(parseDumpConfigRows(text), [
    { id: 'mosaic', name: 'dsh-mosaic' },
    { id: 'superpowers', name: 'dsh-superpowers' },
    { id: 'background-jobs', name: 'dsh-view-background-jobs' },
  ])
})

test('assertBundleRows reports the missing row', () => {
  assert.throws(
    () => assertBundleRows([{ id: 'mosaic', name: 'dsh-mosaic' }], [{ id: 'superpowers', name: 'dsh-superpowers' }]),
    /superpowers/,
  )
})

test('parseWebUrl finds the loopback URL', () => {
  assert.equal(parseWebUrl('ready at http://127.0.0.1:51234 now'), 'http://127.0.0.1:51234')
  assert.equal(parseWebUrl('no url here'), null)
})


test('assertWebProfile requires the web app bundle', () => {
  assert.doesNotThrow(() => assertWebProfile({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-web-app'] } } }))
  assert.throws(() => assertWebProfile({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }), /dsh-web-app/)
})

test('assertRequestedVersion compares exact versions and ignores dist-tags', () => {
  assert.doesNotThrow(() => assertRequestedVersion('0.2.2-rc.1', '0.2.2-rc.1'))
  assert.doesNotThrow(() => assertRequestedVersion('next', '0.2.2-rc.1'))
  assert.throws(() => assertRequestedVersion('0.2.2-rc.1', '0.2.1-rc.5'), /0\.2\.2-rc\.1/)
})
