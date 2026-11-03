import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeView, isRenderable } from '../lib/validate.js'

test('accepts a minimal text view', () => {
  const result = normalizeView({ items: [{ type: 'text', content: 'hello' }] })
  assert.equal(result.errors.length, 0)
  assert.equal(result.spec.items.length, 1)
  assert.equal(result.spec.items[0].type, 'text')
  assert.equal(isRenderable(result), true)
})

test('normalizes callout aliases', () => {
  const result = normalizeView({ items: [{ type: 'callout', text: 'careful', kind: 'danger' }] })
  assert.equal(result.errors.length, 0)
  assert.equal(result.spec.items[0].content, 'careful')
  assert.equal(result.spec.items[0].tone, 'error')
})

test('derives table columns from a 2D body', () => {
  const result = normalizeView({ items: [{ type: 'table', rows: [['name', 'score'], ['Ada', 9]] }] })
  assert.equal(result.errors.length, 0)
  assert.deepEqual(result.spec.items[0].columns, ['name', 'score'])
  assert.deepEqual(result.spec.items[0].rows, [['Ada', 9]])
})

test('drops unknown component types with an error', () => {
  const result = normalizeView({ items: [{ type: 'hologram', content: 'x' }] })
  assert.equal(result.spec, null)
  assert.ok(result.errors.some((error) => error.includes('hologram')))
  assert.equal(isRenderable(result), false)
})

test('enforces the node budget', () => {
  const items = Array.from({ length: 81 }, (_, index) => ({ type: 'text', content: String(index) }))
  const result = normalizeView({ items })
  assert.equal(result.spec, null)
  assert.ok(result.errors.some((error) => error.includes('max nodes')))
})

test('rejects unsafe media and link URLs', () => {
  const result = normalizeView({ items: [
    { type: 'image', src: 'javascript:alert(1)' },
    { type: 'link', label: 'bad', href: 'javascript:alert(1)' },
  ] })
  assert.equal(result.spec, null)
  assert.ok(result.errors.some((error) => error.includes('src')))
  assert.ok(result.errors.some((error) => error.includes('href')))
})

test('wraps a single component root', () => {
  const result = normalizeView({ type: 'stat', label: 'Revenue', value: '$12k' })
  assert.equal(result.errors.length, 0)
  assert.equal(result.spec.items[0].type, 'stat')
})

test('keeps a button without an action as a disabled control', () => {
  const result = normalizeView({ items: [{ type: 'button', label: 'Later' }] })
  assert.equal(result.errors.length, 0)
  assert.equal(result.spec.items[0].type, 'button')
  assert.equal(result.spec.items[0].action, undefined)
})

test('rejects an invalid chart kind', () => {
  const result = normalizeView({ items: [{ type: 'chart', kind: 'radar', data: [{ label: 'A', value: 1 }] }] })
  assert.equal(result.spec, null)
  assert.ok(result.errors.some((error) => error.includes('kind')))
})

test('keeps widget code and clamps its height', () => {
  const result = normalizeView({ items: [{ type: 'widget', code: '<b>hi</b>', height: 5000 }] })
  assert.equal(result.errors.length, 0)
  assert.equal(result.spec.items[0].code, '<b>hi</b>')
  assert.equal(result.spec.items[0].height, 900)
})
test('accepts a flowchart diagram with nodes and edges', () => {
  const result = normalizeView({ items: [{
    type: 'diagram',
    kind: 'flowchart',
    direction: 'TB',
    nodes: [
      { id: 'start', label: 'Start', tone: 'accent' },
      { id: 'check', label: 'Valid?', shape: 'diamond' },
      { id: 'done', label: 'Done', tone: 'success' },
    ],
    edges: [
      { from: 'start', to: 'check' },
      { from: 'check', to: 'done', label: 'yes', kind: 'accent' },
    ],
  }] })
  assert.equal(result.errors.length, 0)
  assert.equal(result.spec.items[0].type, 'diagram')
  assert.equal(result.spec.items[0].nodes.length, 3)
  assert.equal(result.spec.items[0].edges[1].label, 'yes')
})

test('rejects a flowchart edge with an unknown endpoint', () => {
  const result = normalizeView({ items: [{
    type: 'diagram', kind: 'flowchart',
    nodes: [{ id: 'a', label: 'A' }],
    edges: [{ from: 'a', to: 'ghost' }],
  }] })
  assert.equal(result.spec, null)
  assert.ok(result.errors.some((error) => error.includes('ghost')))
})

test('accepts a sequence diagram', () => {
  const result = normalizeView({ items: [{
    type: 'diagram', kind: 'sequence',
    participants: [{ id: 'u', label: 'User' }, { id: 's', label: 'Server' }],
    messages: [
      { from: 'u', to: 's', label: 'request' },
      { from: 's', to: 'u', label: 'response', kind: 'return' },
    ],
  }] })
  assert.equal(result.errors.length, 0)
  assert.equal(result.spec.items[0].messages.length, 2)
})

test('accepts timeline and layers diagrams', () => {
  const timeline = normalizeView({ items: [{ type: 'diagram', kind: 'timeline', items: [{ title: 'v0.1', time: '今天' }] }] })
  assert.equal(timeline.errors.length, 0)
  const layers = normalizeView({ items: [{ type: 'diagram', kind: 'layers', layers: [{ title: 'UI', items: ['React', 'CSS'] }] }] })
  assert.equal(layers.errors.length, 0)
})


test('a widget keeps only the programmatic action opt-in', () => {
  const base = { type: 'widget', code: '<b>x</b>' }
  assert.equal(normalizeView({ items: [base] }).spec.items[0].actions, undefined)
  assert.equal(normalizeView({ items: [{ ...base, actions: 'programmatic' }] }).spec.items[0].actions, 'programmatic')
  assert.equal(normalizeView({ items: [{ ...base, actions: 'auto' }] }).spec.items[0].actions, undefined, 'only the documented value survives')
})

test('accepts the native layout kinds', () => {
  const quadrant = normalizeView({ items: [{
    type: 'diagram', kind: 'quadrant',
    xAxis: ['Low effort', 'High effort'], yAxis: ['Low impact', 'High impact'],
    quadrants: { tl: 'Do first', br: 'Avoid' },
    items: [{ label: 'Fix footer', x: 0.2, y: 0.3, tone: 'accent' }],
  }] })
  assert.equal(quadrant.errors.length, 0)
  assert.equal(quadrant.spec.items[0].items[0].x, 0.2)

  const tree = normalizeView({ items: [{ type: 'diagram', kind: 'tree', root: { label: 'Root', children: [{ label: 'Leaf' }] } }] })
  assert.equal(tree.errors.length, 0)
  assert.equal(tree.spec.items[0].root.children[0].label, 'Leaf')

  const funnel = normalizeView({ items: [{ type: 'diagram', kind: 'funnel', items: [{ label: 'Visits', value: 100 }, { label: 'Signups', value: 20 }] }] })
  assert.equal(funnel.errors.length, 0)

  const venn = normalizeView({ items: [{ type: 'diagram', kind: 'venn', sets: [{ label: 'A' }, { label: 'B' }], center: 'both' }] })
  assert.equal(venn.errors.length, 0)
  assert.equal(venn.spec.items[0].center, 'both')

  const swimlane = normalizeView({ items: [{
    type: 'diagram', kind: 'swimlane',
    lanes: ['Customer', 'Support'],
    steps: [{ lane: 0, label: 'Report' }, { lane: 1, label: 'Triage' }],
  }] })
  assert.equal(swimlane.errors.length, 0)
  assert.equal(swimlane.spec.items[0].steps[1].lane, 1)
})

test('accepts the engine-backed kinds', () => {
  const state = normalizeView({ items: [{
    type: 'diagram', kind: 'state',
    nodes: [{ id: 'idle', label: 'Idle' }, { id: 'done', label: 'Done' }],
    edges: [{ from: 'idle', to: 'done', label: 'finish' }],
    initial: 'idle', final: ['done'],
  }] })
  assert.equal(state.errors.length, 0)
  assert.equal(state.spec.items[0].initial, 'idle')
  assert.deepEqual(state.spec.items[0].final, ['done'])

  const er = normalizeView({ items: [{
    type: 'diagram', kind: 'er',
    entities: [
      { name: 'User', fields: [{ name: 'id', type: 'int', key: 'PK' }] },
      { name: 'Order', fields: [{ name: 'id', type: 'int', key: 'PK' }] },
    ],
    relations: [{ from: 'User', to: 'Order', label: 'places', cardinality: 'one-to-many' }],
  }] })
  assert.equal(er.errors.length, 0)
  assert.equal(er.spec.items[0].relations[0].cardinality, 'one-to-many')

  const gantt = normalizeView({ items: [{ type: 'diagram', kind: 'gantt', tasks: [{ name: 'Design', start: '2026-01-01', end: '2026-01-10' }] }] })
  assert.equal(gantt.errors.length, 0)

  const mindmap = normalizeView({ items: [{ type: 'diagram', kind: 'mindmap', root: { label: 'Root', children: [{ label: 'A' }] } }] })
  assert.equal(mindmap.errors.length, 0)
})

test('rejects a tree that is too deep and a point outside the quadrant', () => {
  const deep = { label: 'l0', children: [{ label: 'l1', children: [{ label: 'l2', children: [{ label: 'l3', children: [{ label: 'l4' }] }] }] }] }
  const tree = normalizeView({ items: [{ type: 'diagram', kind: 'tree', root: deep }] })
  assert.equal(tree.spec, null)
  assert.ok(tree.errors.some((error) => error.includes('depth')))

  const outside = normalizeView({ items: [{ type: 'diagram', kind: 'quadrant', items: [{ label: 'x', x: 1.4, y: 0.2 }] }] })
  assert.equal(outside.spec, null, 'a clamped point would lie about its position')
})

test('normalizes a diagram legend and drops unknown tones', () => {
  const result = normalizeView({ items: [{
    type: 'diagram', kind: 'layers', legend: [{ label: 'Focal', tone: 'accent' }, { label: 'External', tone: 'neon' }],
    layers: [{ title: 'UI', items: ['React'] }],
  }] })
  assert.equal(result.errors.length, 0)
  assert.deepEqual(result.spec.items[0].legend, [{ label: 'Focal', tone: 'accent' }, { label: 'External' }])
})

test('warns when a table is longer than a chat card reads well', () => {
  const rows = Array.from({ length: 12 }, (_, index) => [`row ${index}`, index])
  const result = normalizeView({ items: [{ type: 'table', columns: ['name', 'n'], rows }] })
  assert.equal(result.errors.length, 0)
  assert.ok(result.warnings.some((warning) => warning.includes('12 rows')))
})

test('stays quiet for a view inside every budget', () => {
  const result = normalizeView({ items: [
    { type: 'table', columns: ['name', 'n'], rows: [['a', 1], ['b', 2]] },
    { type: 'diagram', kind: 'flowchart', nodes: [{ id: 'a', label: 'A', tone: 'accent' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] },
  ] })
  assert.equal(result.errors.length, 0)
  assert.deepEqual(result.warnings, [])
})

test('warns when more than two elements compete for focal accent', () => {
  const result = normalizeView({ items: [{
    type: 'diagram', kind: 'flowchart',
    nodes: [
      { id: 'a', label: 'A', tone: 'accent' },
      { id: 'b', label: 'B', tone: 'accent' },
      { id: 'c', label: 'C', tone: 'accent' },
    ],
  }] })
  assert.equal(result.errors.length, 0)
  assert.ok(result.warnings.some((warning) => warning.includes('focal accents')))
})

test('warns when a diagram is over its readable size', () => {
  const nodes = Array.from({ length: 11 }, (_, index) => ({ id: `n${index}`, label: `Node ${index}` }))
  const result = normalizeView({ items: [{ type: 'diagram', kind: 'flowchart', nodes }] })
  assert.equal(result.errors.length, 0)
  assert.ok(result.warnings.some((warning) => warning.includes('11 nodes')))
})

test('warns when a widget asks for an asset the sandbox blocks', () => {
  const result = normalizeView({ items: [{
    type: 'widget',
    code: '<script src="https://cdn.example/chart.js"></script>',
  }] })
  assert.equal(result.errors.length, 0)
  assert.ok(result.warnings.some((warning) => warning.includes('blocks remote assets')))
})
