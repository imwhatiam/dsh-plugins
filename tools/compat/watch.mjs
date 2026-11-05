import { appendFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

export function isWatchedTag(tag) {
  return /^dsh-v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(tag)
}

function parseVersion(value) {
  const [core, pre] = value.replace(/^dsh-v/, '').split('-')
  const [major, minor, patch] = core.split('.').map(Number)
  return { major, minor, patch, pre: pre ?? null }
}

function compare(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return Number(a.pre.replace(/^rc\./, '')) - Number(b.pre.replace(/^rc\./, ''))
}

export function selectNewerRelease(releases, current) {
  const watched = releases.filter((release) => isWatchedTag(release.tag_name))
  watched.sort((a, b) => compare(b.tag_name, a.tag_name))
  return watched.find((release) => compare(release.tag_name, `dsh-v${current}`) > 0) ?? null
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const compat = JSON.parse(readFileSync(join(root, 'dsh-compat.json'), 'utf8'))
  const headers = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const response = await fetch('https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=30', { headers })
  if (!response.ok) throw new Error(`GitHub releases request failed: ${response.status}`)

  const releases = await response.json()
  const release = selectNewerRelease(releases, compat.dsh)
  const tag = release?.tag_name ?? ''

  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`)
  console.log(tag || 'no newer watched release')
}
