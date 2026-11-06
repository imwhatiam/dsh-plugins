import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const root = new URL('../..', import.meta.url).pathname
const read = (path) => parse(readFileSync(join(root, path), 'utf8'))

test('ci runs tests, pack checks, and the probe', () => {
  const ci = read('.github/workflows/ci.yml')
  assert.equal(ci.jobs.test['runs-on'], 'ubuntu-latest')
  assert.equal(ci.jobs.test['timeout-minutes'], 15)
  const run = ci.jobs.test.steps.map((step) => step.run).filter(Boolean).join('\n')
  assert.match(run, /npm ci/)
  assert.match(run, /npm test/)
  assert.match(run, /npm run pack:check/)
  assert.match(run, /npm i -g "@deepseek-ai\/dsh@/)
  assert.match(run, /npm run compat:probe/)
})

test('the watcher only runs on a schedule and can open issues', () => {
  const watch = read('.github/workflows/dsh-watch.yml')
  assert.equal(watch.on.schedule[0].cron, '0 1 * * *')
  assert.equal(watch.permissions.issues, 'write')
  assert.match(watch.jobs.watch.steps.map((s) => s.run).filter(Boolean).join('\n'), /compat:watch/)
})

test('the canary is non-blocking and manual', () => {
  const canary = read('.github/workflows/compat-canary.yml')
  assert.ok(canary.on.workflow_dispatch)
  assert.equal(canary.jobs.canary['continue-on-error'], true)
  assert.equal(canary.jobs.canary['timeout-minutes'], 15)
  assert.equal(canary.permissions.issues, 'write')
  assert.ok(canary.jobs.canary.steps.some((step) => step.if === 'failure()'))
  assert.match(canary.jobs.canary.steps.map((s) => s.run).filter(Boolean).join('\n'), /compat:probe/)
})

test('release publishes only dsh-mosaic from a v tag with OIDC', () => {
  const release = read('.github/workflows/release.yml')
  assert.deepEqual(release.on.push.tags, ['v*'])
  assert.equal(release.permissions['id-token'], 'write')
  assert.match(release.jobs.publish.steps.map((s) => s.run).filter(Boolean).join('\n'), /npm publish --workspace dsh-mosaic/)
})

test('upstream sync targets dsh-superpowers', () => {
  const sync = read('.github/workflows/upstream-sync.yml')
  assert.match(sync.jobs['upstream-sync'].steps.map((s) => s.run).filter(Boolean).join('\n'), /-w dsh-superpowers/)
})
