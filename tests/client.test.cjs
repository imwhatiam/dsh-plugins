'use strict'

/**
 * Pure-logic tests for the Background jobs client module.
 *
 * The browser module is a classic script, so the test evaluates its source in
 * a vm sandbox with `__BACKGROUND_JOBS_TEST__` set. The module exposes its
 * helpers only in that mode; the browser path is untouched.
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
  const sandbox = { __BACKGROUND_JOBS_TEST__: true, console }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  const helpers = sandbox.__BACKGROUND_JOBS_HELPERS__
  assert.ok(helpers, 'client.js must expose __BACKGROUND_JOBS_HELPERS__ in test mode')
  return helpers
}

function job(id, owner, status, startedAt) {
  return {
    id,
    kind: 'bash',
    label: `run ${id}`,
    owner,
    status,
    startedAt,
    output: { total: 0, earliest: 0 },
  }
}

test('mergeRunningJobs keeps only live jobs, deduplicates by id, and sorts by start', () => {
  const { mergeRunningJobs } = loadHelpers()
  const snapshot = {
    rows: {
      'session-a': [
        job('job-1', 'session-a', 'running', 100),
        job('job-2', 'session-a', 'completed', 90),
      ],
      'session-b': [
        job('job-1', 'session-a', 'running', 100),
        job('job-3', 'session-b', 'stopping', 50),
      ],
    },
    observed: {},
  }

  const merged = mergeRunningJobs(snapshot)

  assert.deepEqual(Array.from(merged, (entry) => entry.id), ['job-3', 'job-1'])
  assert.deepEqual(Array.from(merged, (entry) => entry.status), ['stopping', 'running'])
})

test('groupRunningJobs separates workspace, ungrouped, and unassigned jobs', () => {
  const { groupRunningJobs } = loadHelpers()
  const jobs = [
    job('job-1', 'session-a', 'running', 100),
    job('job-2', 'session-b', 'running', 200),
    job('job-3', undefined, 'running', 300),
  ]
  const sessionById = new Map([
    ['session-a', { sessionId: 'session-a', title: 'Alpha' }],
    ['session-b', { sessionId: 'session-b', title: 'Beta' }],
  ])
  const workspaceBySession = new Map([
    ['session-a', { workspaceId: 'ws-1', title: 'Workspace One', path: '/work/one' }],
  ])

  const groups = groupRunningJobs(jobs, sessionById, workspaceBySession)

  assert.deepEqual(Array.from(groups, (group) => group.kind), ['workspace', 'ungrouped', 'unassigned'])
  assert.deepEqual(Array.from(groups[0].jobs, (entry) => entry.id), ['job-1'])
  assert.equal(groups[0].workspace.title, 'Workspace One')
  assert.equal(groups[1].session.sessionId, 'session-b')
  assert.equal(groups[2].session, undefined)
})

test('groupRunningJobs sorts real workspaces by title and keeps job start order inside a group', () => {
  const { groupRunningJobs } = loadHelpers()
  const jobs = [
    job('job-b2', 'session-b', 'running', 200),
    job('job-a1', 'session-a', 'running', 100),
    job('job-a2', 'session-a', 'running', 50),
  ]
  const sessionById = new Map([
    ['session-a', { sessionId: 'session-a', title: 'Alpha' }],
    ['session-b', { sessionId: 'session-b', title: 'Beta' }],
  ])
  const workspaceBySession = new Map([
    ['session-a', { workspaceId: 'ws-a', title: 'Zulu', path: '/zulu' }],
    ['session-b', { workspaceId: 'ws-b', title: 'Alpha workspace', path: '/alpha' }],
  ])

  const groups = groupRunningJobs(jobs, sessionById, workspaceBySession)

  assert.deepEqual(Array.from(groups, (group) => group.workspace.title), ['Alpha workspace', 'Zulu'])
  assert.deepEqual(Array.from(groups[1].jobs, (entry) => entry.id), ['job-a2', 'job-a1'])
})

test('formatDuration uses the largest two units', () => {
  const { formatDuration } = loadHelpers()

  assert.equal(formatDuration(0, 'en'), '0s')
  assert.equal(formatDuration(65_000, 'en'), '1m 5s')
  assert.equal(formatDuration(3_725_000, 'en'), '1h 2m')
})

test('shortSessionId strips the session prefix and keeps eight characters', () => {
  const { shortSessionId } = loadHelpers()

  assert.equal(shortSessionId('session-abcdef12-3456-7890'), 'abcdef12')
  assert.equal(shortSessionId('abcdef12-3456'), 'abcdef12')
})
