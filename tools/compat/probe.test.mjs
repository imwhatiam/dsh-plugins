import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const root = new URL('../..', import.meta.url).pathname

test('--dry-run prints the profile manifest and does not touch DSH', () => {
  const output = execFileSync(process.execPath, [join(root, 'tools/compat/probe.mjs'), '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
  })
  const manifest = JSON.parse(output)
  assert.equal(manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-web-app'), true)
  assert.equal(Object.keys(manifest.dependencies).length, 3)
})
