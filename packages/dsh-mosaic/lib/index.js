/**
 * dsh-mosaic host half.
 *
 * Adds a compact visual-answer section to the system prompt, two model tools
 * (`render_view`, `validate_view`), and a bundled `mosaic` skill with the full
 * field reference. The browser half renders the `dsh-view` fence and the
 * `render_view` tool card; it ships no heavy chart or diagram engines.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLog } from './log.js'
import { createPromptController, crossSiteError, PROMPT_ROUTE, readJsonBody } from './prompt-store.js'
import { createRenderViewTool } from './render-tool.js'
import { createValidateViewTool } from './validate-tool.js'

const PACKAGE_VERSION = createRequire(import.meta.url)('../package.json').version

export const name = 'dsh-mosaic'
export const inject = ['systemPrompt']

/* ------------------------------------------------------------------ */
/* lazy Mermaid engine                                                 */
/* ------------------------------------------------------------------ */

// `/plugins` belongs to the client module system, so a plugin asset route keeps to a
// package-private prefix and never shadows or collides with it.
const ASSET_ROUTE_PATH = '/dsh-mosaic/assets'
const ASSET_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/
// The unmodified official Mermaid distribution; see THIRD_PARTY_NOTICES.md.
const MERMAID_ASSET_FILE = 'mermaid.min.js'
const MERMAID_VERSION = '12.2.0'
// Client-side diagnostics land here; bounded body, same-origin only.
const LOG_ROUTE = '/dsh-mosaic/log'
const LOG_BODY_LIMIT = 4096

/**
 * Resolve the prompt this plugin contributes to the system prompt. The row's
 * `config.prompt` overrides the built-in text; an absent, blank, oversized, or
 * non-string value falls back to it, so a malformed patch can never silence the
 * visualization guidance.
 *
 * @param {unknown} config - the Loader row's config.
 * @returns {string} the prompt to contribute.
 */
export function resolvePrompt(config) {
  const prompt = config !== null && typeof config === 'object' ? config.prompt : undefined
  if (typeof prompt !== 'string') return MOSAIC_SECTION_TEXT
  const trimmed = prompt.trim()
  if (trimmed === '' || Buffer.byteLength(trimmed, 'utf8') > 128 * 1024) return MOSAIC_SECTION_TEXT
  return trimmed
}

async function serveMosaicAsset(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  if (!pathname.startsWith(`${ASSET_ROUTE_PATH}/`)) {
    res.writeHead(404)
    res.end()
    return
  }
  const file = pathname.slice(ASSET_ROUTE_PATH.length + 1)
  if (!ASSET_FILE_RE.test(file)) {
    res.writeHead(404)
    res.end()
    return
  }
  try {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url))
    const body = await readFile(resolve(moduleDirectory, 'assets', file))
    const versioned = new URL(req.url ?? '/', 'http://x').searchParams.has('v')
    res.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      // The client appends ?v=<version>, so a versioned URL can be cached for good;
      // anything else keeps revalidating.
      'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}

export const MOSAIC_SECTION_TEXT = `Render a visual answer with a fenced \`dsh-view\` JSON block, or with the \`render_view\` tool when a self-contained card is useful.

\`\`\`dsh-view
{"title":"Ops snapshot","gap":12,"items":[{"type":"stat","label":"Uptime","value":"99.96%"}]}
\`\`\`

Mosaic is optional. Use it when a component makes the answer easier to scan; plain prose is fine. Prefer a single focal component, and never repeat the same data as both a table and a chart.

These read as decoration rather than information:
- Three equal-width stat cards as a header → one stat, or a table.
- \`tone:"accent"\` on more than two elements → decide what is focal.
- Cards nested more than two deep → flatten one level.
- A table longer than 8 rows in chat → add filter/sort, or split it.
- A chart with one point, or a diagram of two boxes → write the sentence.
- A component that only restates the paragraph above it → delete it.

Components (fields in the \`mosaic\` skill):
- Layout: text · row · col · grid · card · divider · spacer
- Display: stat · badge · progress · list · table · keyvalue · steps · callout · code · diff · chart · diagram
- Media: image · video · audio · pdf · link
- Interactive: button · input · select · slider · tabs · quiz
- Advanced: widget (HTML/CSS/JS in an opaque-origin, no-network sandbox iframe)

Rules:
- Put \`dsh-view\` in the reply body, never in reasoning. JSON must be strict.
- The opening fence tag MUST be exactly \`dsh-view\`. Never use \`\`\`json, \`\`\`text, or an unlabelled fence for a full spec; a \`json\` fence is at best a legacy fallback and may not render.
- Files and Office documents: use a \`link\` card. Mosaic does not read local files or render Office; the host app opens them.
- Media accepts an http(s) or root-relative URL.
- Interactions are local by default. A button \`action\` sends \`[mosaic-action]\`; \`local\` supports reset/copy/open/fullscreen. A button with neither is disabled.
- Diagrams: choose the kind by the question, and stay near its readable size — \`flowchart\` ≤9 nodes for branches, \`sequence\` ≤5 lifelines for messages in time, \`timeline\` ≤7 items, \`layers\` ≤6 levels, \`quadrant\` ≤12 items for two-axis positioning, \`tree\` ≤12 nodes and depth 4 for hierarchy, \`funnel\` ≤6 steps, \`venn\` 2–3 sets, \`swimlane\` ≤6 steps for hand-offs across lanes, \`state\` ≤9 states, \`er\` ≤8 entities, \`gantt\` ≤12 tasks, \`mindmap\` ≤12 branches. Do not hand-write Mermaid outside a widget; for a long flowchart prefer \`direction:"TB"\`.
- \`legend:[{label,tone}]\` states what a colour means. Add it when \`tone\` carries meaning; omit it when the colours are decoration.
- Limits: 80 nodes, depth 6, table 40×8, chart 40 points, widget code 20k. \`validate_view\` is a preflight: a valid but heavy view returns \`warnings=\` lines, so run it before a large fence and fix what it names.

Field quick reference:
- text {content, size, align, tone, mono}
- stat {label, value, delta, spark:[numbers]}
- table {columns:[strings], rows:[[cells]], types:[text|num|delta|bar|badge], total, export, filter:<field id>, sort:<field id>}
- chart {kind:bars|line|donut, data:[{label,value}], series:[{label,data:[{label,value}]}], stacked}
- diagram {kind, title?, legend?:[{label,tone}]}. Members by kind — flowchart/state {nodes:[{id,label,sub?,tone?,shape?}], edges:[{from,to,label?,kind?}], direction?, initial?, final?}; sequence {participants:[{id,label}], messages:[{from,to,label,kind?}]}; timeline {items:[{title,desc?,time?}]}; layers {layers:[{title,items:[string]}]}; quadrant {xAxis:[lo,hi], yAxis:[lo,hi], quadrants:{tl,tr,bl,br}, items:[{label,x,y,tone?}]} (x,y 0–1); tree/mindmap {root:{label,sub?,tone?,children?:[...]}}; funnel {items:[{label,value}]}; venn {sets:[{label,tone?}], center?}; swimlane {lanes:[string], steps:[{lane,label}]}; er {entities:[{name,fields:[{name,type?,key?:PK|FK}]}], relations?:[{from,to,label?,cardinality?}]}; gantt {tasks:[{name,start,end,section?}]} (YYYY-MM-DD).
- callout {content, title, tone:info|success|warning|error}
- list {items: strings | {title,desc} | components}
- button {label, action | local:reset|copy|open|fullscreen, text, url, tone}
- input/select/slider {id, label, ...}; table/list filter binds to an input/select id
- quiz {question, options:[{label,correct,feedback}], explanation}
- widget {code, height, title, caption}
- link {label, href, description}; image/video/audio/pdf {src, ...}

The \`mosaic\` skill carries the full component table, examples, and the widget bridge (\`window.mosaic.action\`, \`window.mosaic.resize\`).`

/**
 * Externally chosen finite order: `getSectionOrder(name)` resolves centrally allocated
 * positions reserved for repository-owned contributors, so a plugin names its own slot.
 * 9800 sits after the deliverable guidance and before the structured-output section.
 */
const PROMPT_SECTION_ORDER = 9800

function registerPromptSection(ctx, text) {
  return ctx.systemPrompt.section({
    name: 'mosaic:view',
    order: PROMPT_SECTION_ORDER,
    text,
    interpolate: false,
  })
}

const BUNDLED_SKILL_PROVIDER = 'dsh-mosaic'
const BUNDLED_SKILL_NAME = 'mosaic'
// Lower than the packaged-skill standard rank (600) on purpose: a user-installed skill
// named `mosaic` should win over this plugin's guidance copy.
const MOSAIC_SKILL_RANK = 550
const BUNDLED_SKILL_INVOCATION = { modelInvocable: true, userInvocable: true }

function frontmatterField(front, key) {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'mu').exec(front)
  return match?.[1]?.replace(/^['"]|['"]$/gu, '')
}

function bundledSkillProvider() {
  const skill = bundledSkill()
  return {
    name: BUNDLED_SKILL_PROVIDER,
    // A missing or malformed SKILL.md reports an incomplete catalog instead of
    // throwing at plugin activation, so the fence and tool channels keep working.
    list: () => Promise.resolve({
      candidates: skill === undefined ? [] : [skillEntry(skill)],
      complete: skill !== undefined,
    }),
    get: (candidate) => {
      if (candidate === undefined) return Promise.resolve(undefined)
      const current = bundledSkill()
      if (current === undefined) return Promise.resolve(undefined)
      return Promise.resolve({ ...skillEntry(current), content: current.raw.slice(current.end + 5) })
    },
  }
}

/** Read the bundled skill, or `undefined` when it cannot be used. */
function bundledSkill() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const path = resolve(moduleDirectory, '../SKILL.md')
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  const end = raw.indexOf('\n---\n', 4)
  if (!raw.startsWith('---\n') || end < 0) return undefined
  const description = frontmatterField(raw.slice(4, end), 'description')
  if (description === undefined) return undefined
  return { path, raw, end, description }
}

/** One catalog entry; `locator` is the opaque handle this provider owns. */
function skillEntry(skill) {
  return {
    name: BUNDLED_SKILL_NAME,
    description: skill.description,
    invocation: BUNDLED_SKILL_INVOCATION,
    source: 'bundled',
    provider: BUNDLED_SKILL_PROVIDER,
    path: skill.path,
    resourceBase: { kind: 'directory', path: dirname(skill.path) },
    rank: MOSAIC_SKILL_RANK,
    locator: skill.path,
  }
}
/**
 * Register the Mosaic prompt section, tools, and skill.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  const log = createLog({ ctx, level: config && typeof config === 'object' ? config.logLevel : undefined })
  const clock = () => Date.now()
  log.info('plugin.activate', {
    version: PACKAGE_VERSION,
    node: process.version,
    configKeys: config && typeof config === 'object' ? Object.keys(config) : [],
    logFile: log.file,
  })
  ctx.effect(() => () => {
    log.info('plugin.deactivate', {})
    void log.flush()
  }, 'dsh-mosaic: log lifecycle')

  // The effective prompt is the user's saved override, then the row's `config.prompt`,
  // then the built-in text. The controller owns re-registration on every change, so the
  // settings page and the profile patch both take effect without a reload.
  const prompts = createPromptController({
    ctx,
    config,
    log,
    builtin: MOSAIC_SECTION_TEXT,
    resolveConfigPrompt: resolvePrompt,
    registerSection: registerPromptSection,
    // A version query lets the asset route answer with an immutable cache entry.
    assets: { mermaid: `${ASSET_ROUTE_PATH}/${MERMAID_ASSET_FILE}?v=${MERMAID_VERSION}` },
  })
  ctx.effect(() => prompts.start(), 'dsh-mosaic: prompt section')
  prompts.hydrate().catch((error) => {
    log.error('prompt.hydrate-failed', error)
  })

  // Tools are optional: a host without a tool registry keeps the fence channel.
  // Every execution is recorded with its outcome and duration, never its arguments.
  const traced = (definition) => ({
    ...definition,
    async execute(args, exec) {
      const started = clock()
      try {
        const value = await definition.execute(args, exec)
        log.info('tool.execute', {
          tool: definition.name,
          status: typeof value?.status === 'string' ? value.status : 'ok',
          rendered: typeof value?.rendered === 'number' ? value.rendered : undefined,
          errors: Array.isArray(value?.errors) ? value.errors.length : undefined,
          ms: clock() - started,
        })
        return value
      } catch (error) {
        log.error('tool.failed', error, { tool: definition.name, ms: clock() - started })
        throw error
      }
    },
  })
  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(function* () {
      yield toolsCtx.tools.register(traced(createRenderViewTool()))
      yield toolsCtx.tools.register(traced(createValidateViewTool()))
    }, 'dsh-mosaic: tools')
  })

  // The skill is optional too; the compact prompt section remains usable.
  ctx.inject(['skills'], (skillCtx) => {
    skillCtx.effect(
      () => skillCtx.skills.registerProvider(() => {
        const provider = bundledSkillProvider()
        return {
          ...provider,
          async list(options) {
            const result = await provider.list(options)
            log.info('skill.list', { candidates: Array.isArray(result?.candidates) ? result.candidates.length : 0, complete: result?.complete })
            return result
          },
          async get(candidate) {
            const definition = await provider.get(candidate)
            log.info('skill.get', { found: definition !== undefined })
            return definition
          },
        }
      }),
      'dsh-mosaic: skill provider',
    )
  })

  /** Record one served route without changing its response. */
  const tracedRoute = (name, handler) => async (req, res) => {
    const started = clock()
    try {
      await handler(req, res)
    } finally {
      log.info('route', { route: name, method: req.method ?? '?', status: res.statusCode, ms: clock() - started })
    }
  }

  /**
   * Accept one bounded diagnostic line from the browser half.
   *
   * @param {import('node:http').IncomingMessage} req - request.
   * @param {import('node:http').ServerResponse} res - response.
   * @param {{ bindHost?: string, trustedHosts?: readonly string[] }} policy - the
   *   authorities this listener answers.
   */
  async function handleClientLog(req, res, policy) {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const rejection = crossSiteError(req, policy)
    if (rejection !== undefined) {
      log.warn('client.log-rejected', { reason: rejection })
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: rejection }))
      return
    }
    let body
    try {
      body = await readJsonBody(req, LOG_BODY_LIMIT)
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    const event = typeof body?.event === 'string' ? body.event.slice(0, 60) : 'client.event'
    const detail = body?.detail !== null && typeof body?.detail === 'object' ? body.detail : {}
    const fields = { source: 'client', ...detail }
    if (body?.level === 'error') log.error(`client.${event}`, body?.message === undefined ? undefined : new Error(String(body.message)), fields)
    else log.warn(`client.${event}`, fields)
    // Answer only once the line is durable, so 204 is a receipt rather than a promise
    // the caller has to confirm by polling the file.
    try {
      await log.flush()
    } catch {}
    res.writeHead(204)
    res.end()
  }

  // Mermaid is a lazy standalone asset, served from this package's own route.
  // A host without a webserver keeps the built-in SVG fallback.
  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    // A request authority is ours when it names loopback, this listener's own bind
    // address, or a host the deployment declared. Comparing Origin to Host is not
    // enough: under DNS rebinding both carry the attacker's name.
    const authority = {
      ...typeof webServer.host === 'string' && webServer.host !== '' ? { bindHost: webServer.host } : {},
      ...Array.isArray(config?.trustedHosts) ? { trustedHosts: config.trustedHosts } : {},
    }
    webCtx.effect(
      () => webServer.register({ kind: 'prefix', path: ASSET_ROUTE_PATH, handler: tracedRoute('assets', serveMosaicAsset) }),
      'dsh-mosaic: asset route',
    )
    // The settings page reads and writes the prompt here. Requests must name this
    // listener and come from its own origin; see requestPolicyError for the checks.
    webCtx.effect(
      () => webServer.register({
        kind: 'exact',
        path: PROMPT_ROUTE,
        handler: tracedRoute('prompt', (req, res) => prompts.handle(req, res, authority)),
      }),
      'dsh-mosaic: prompt route',
    )
    webCtx.effect(
      () => webServer.register({
        kind: 'exact',
        path: LOG_ROUTE,
        handler: tracedRoute('log', (req, res) => handleClientLog(req, res, authority)),
      }),
      'dsh-mosaic: log route',
    )
  })
}
