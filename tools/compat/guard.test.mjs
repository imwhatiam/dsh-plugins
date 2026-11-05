import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderTable } from '../../scripts/render-compat-table.mjs'

const root = new URL('../..', import.meta.url).pathname
const compat = JSON.parse(readFileSync(join(root, 'dsh-compat.json'), 'utf8'))
const surface = JSON.parse(readFileSync(join(root, 'tools/compat/surface.json'), 'utf8'))

function packageJson(name) {
  return JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))
}

test('compat records the current package versions', () => {
  for (const [name, entry] of Object.entries(compat.packages)) {
    assert.equal(entry.version, packageJson(name).version, name)
  }
})

test('compat mirrors engines.dsh', () => {
  for (const [name, entry] of Object.entries(compat.packages)) {
    assert.equal(entry.engines, packageJson(name).engines.dsh, name)
  }
})

test('the verified DSH version satisfies every engines.dsh range', () => {
  for (const [name, entry] of Object.entries(compat.packages)) {
    const [, lower, upper] = entry.engines.match(/^>=(.+?) <(.+)$/)
    assert.ok(compare(compat.dsh, lower) >= 0, `${name}: ${compat.dsh} < ${lower}`)
    assert.ok(compare(compat.dsh, upper) < 0, `${name}: ${compat.dsh} >= ${upper}`)
  }
})

test('surface covers every ctx service, slot, import, and event in package sources', () => {
  for (const [name, entry] of Object.entries(surface)) {
    const source = readSources(join(root, 'packages', name))
    for (const service of entry.services) assert.match(source, new RegExp(`ctx\\.${service}\\b`), `${name} service ${service}`)
    for (const inject of entry.injects ?? []) assert.match(source, new RegExp(`ctx\\.inject\\(\\[[^\\]]*['"]${inject}['"]`), `${name} inject ${inject}`)
    for (const slot of entry.slots) assert.ok(source.includes(slot), `${name} slot ${slot}`)
    for (const specifier of entry.imports) assert.ok(source.includes(specifier), `${name} import ${specifier}`)
    for (const event of entry.events) assert.ok(source.includes(event), `${name} event ${event}`)
  }
})

const CORDIS_METHODS = new Set(['effect', 'inject', 'on', 'dispose', 'get', 'set', 'emit', 'parallel', 'waterfall', 'bail', 'serial'])

function discoverSurface(source) {
  const services = new Set(
    [...source.matchAll(/ctx\.([A-Za-z_]\w*)/g)]
      .map((match) => match[1])
      .filter((service) => !CORDIS_METHODS.has(service)),
  )
  const slots = new Set([...source.matchAll(/slots\.(?:register|inject)\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]))
  const imports = new Set([...source.matchAll(/(?:from|require\()\s*['"](@deepseek-ai\/[^'"]+)['"]/g)].map((match) => match[1]))
  const events = new Set([...source.matchAll(/ctx\.on\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]))
  return { services, slots, imports, events }
}

test('discoverSurface finds services, slots, imports, and events', () => {
  const source = [
    "import x from '@deepseek-ai/x'",
    'ctx.foo',
    "ctx.on('bar')",
    "ctx.slots.register('baz', {})",
    "ctx.inject(['qux'])",
  ].join('\n')
  const found = discoverSurface(source)
  assert.deepEqual([...found.services].sort(), ['foo', 'slots'])
  assert.deepEqual([...found.slots], ['baz'])
  assert.deepEqual([...found.imports], ['@deepseek-ai/x'])
  assert.deepEqual([...found.events], ['bar'])
})

test('every discovered surface item is declared', () => {
  for (const [name, entry] of Object.entries(surface)) {
    const found = discoverSurface(readSources(join(root, 'packages', name)))
    for (const service of found.services) assert.ok(entry.services.includes(service), `${name}: undeclared service ctx.${service}`)
    for (const slot of found.slots) assert.ok(entry.slots.includes(slot), `${name}: undeclared slot ${slot}`)
    for (const specifier of found.imports) assert.ok(entry.imports.includes(specifier), `${name}: undeclared import ${specifier}`)
    for (const event of found.events) assert.ok(entry.events.includes(event), `${name}: undeclared event ${event}`)
  }
})

test('the verified DSH version has a passing verification record', () => {
  const record = readFileSync(join(root, 'docs', 'verification', `${compat.dsh}.md`), 'utf8')
  assert.match(record, /status:\s*passed/)
})

test('no package test file is gitignored', () => {
  for (const name of Object.keys(surface)) {
    const dir = join(root, 'packages', name)
    for (const file of testFiles(dir)) {
      const result = spawnSync('git', ['check-ignore', '-q', file], { cwd: root })
      assert.equal(result.status, 1, `${file} is ignored`)
    }
  }
})

test('the root README table matches dsh-compat.json', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const block = readme.match(/<!-- compat:begin -->([\s\S]*?)<!-- compat:end -->/)?.[1]
  assert.ok(block, 'README compat block missing')
  assert.equal(block.trim(), renderTable(compat).trim())
})

const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'tests', 'assets', 'skills'])

function compare(left, right) {
  const parse = (value) => {
    const [core, pre] = value.split('-')
    const [major, minor, patch] = core.split('.').map(Number)
    return { major, minor, patch, pre: pre ?? null }
  }
  const a = parse(left)
  const b = parse(right)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return Number(a.pre.replace(/^rc\./, '')) - Number(b.pre.replace(/^rc\./, ''))
}

function readSources(dir) {
  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue
      const path = join(current, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (path.endsWith('.js')) files.push(readFileSync(path, 'utf8'))
    }
  }
  walk(dir)
  return files.join('\n')
}

function testFiles(dir) {
  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === '.git') continue
      const path = join(current, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.test\.(mjs|cjs|js)$/.test(path)) files.push(path)
    }
  }
  walk(dir)
  return files
}
