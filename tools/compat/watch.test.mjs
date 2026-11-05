import assert from 'node:assert/strict'
import test from 'node:test'
import { isWatchedTag, selectNewerRelease } from './watch.mjs'

test('isWatchedTag accepts rc and stable, rejects alpha', () => {
  assert.equal(isWatchedTag('dsh-v0.2.2-rc.1'), true)
  assert.equal(isWatchedTag('dsh-v0.2.2'), true)
  assert.equal(isWatchedTag('dsh-v0.2.2-alpha.3'), false)
  assert.equal(isWatchedTag('v0.2.2'), false)
})

test('selectNewerRelease picks the highest watched release', () => {
  const releases = [
    { tag_name: 'dsh-v0.2.1-rc.5' },
    { tag_name: 'dsh-v0.2.2-rc.1' },
    { tag_name: 'dsh-v0.2.2-alpha.3' },
  ]
  assert.equal(selectNewerRelease(releases, '0.2.1-rc.5').tag_name, 'dsh-v0.2.2-rc.1')
  assert.equal(selectNewerRelease(releases, '0.2.2-rc.1'), null)
})
