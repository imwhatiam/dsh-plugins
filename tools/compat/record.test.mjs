import assert from 'node:assert/strict'
import test from 'node:test'
import { recordVerified, assertVerification } from './record.mjs'

test('recordVerified updates dsh, verifiedAt, version, and engines', () => {
  const compat = { dsh: '0.2.1-rc.5', verifiedAt: '2026-10-30', packages: { 'dsh-mosaic': { version: '1.1.3', engines: '>=0.2.1-rc.1 <0.3.0-0' } } }
  const next = recordVerified({
    compat,
    packageName: 'dsh-mosaic',
    packageJson: { version: '1.1.4', engines: { dsh: '>=0.2.1-rc.1 <0.3.0-0' } },
    dsh: '0.2.2-rc.1',
    today: '2026-11-05',
  })
  assert.equal(next.dsh, '0.2.2-rc.1')
  assert.equal(next.verifiedAt, '2026-11-05')
  assert.equal(next.packages['dsh-mosaic'].version, '1.1.4')
})

test('assertVerification requires a passing record for the version', () => {
  assert.doesNotThrow(() => assertVerification('# 0.2.2-rc.1\nstatus: passed\n', '0.2.2-rc.1'))
  assert.throws(() => assertVerification('# 0.2.2-rc.1\nstatus: failed\n', '0.2.2-rc.1'), /passed/)
  assert.throws(() => assertVerification('# 0.2.1-rc.5\nstatus: passed\n', '0.2.2-rc.1'), /0.2.2-rc.1/)
})
