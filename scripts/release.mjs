import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertVerification } from '../tools/compat/record.mjs'
import { renderTable } from './render-compat-table.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

export function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`unknown bump type: ${type}`)
}

export function tagFor(packageName, version) {
  return packageName === 'dsh-mosaic' ? `v${version}` : null
}

export function ensureChangelogHeader(text, version, date) {
  const header = `## ${version} — ${date}`
  if (text.includes(header)) return text

  const lines = text.split('\n')
  const firstHeading = lines.findIndex((line) => line.startsWith('# '))
  const insertAt = firstHeading >= 0 ? firstHeading + 1 : 0
  return [...lines.slice(0, insertAt), '', header, ...lines.slice(insertAt)].join('\n')
}

export function updateReadmeTable(readme, compat) {
  const block = `<!-- compat:begin -->\n${renderTable(compat)}\n<!-- compat:end -->`
  return readme.includes('<!-- compat:begin -->')
    ? readme.replace(/<!-- compat:begin -->[\s\S]*?<!-- compat:end -->/, block)
    : `${readme.trimEnd()}\n\n${block}\n`
}

export function planRelease({ root: repoRoot, packageName, bump }) {
  const manifestPath = join(repoRoot, 'packages', packageName, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const compatPath = join(repoRoot, 'dsh-compat.json')
  const compat = JSON.parse(readFileSync(compatPath, 'utf8'))
  const entry = compat.packages[packageName]

  if (!entry) throw new Error(`dsh-compat.json has no entry for ${packageName}`)
  if (!compat.dsh) throw new Error('dsh-compat.json has no verified DSH version')
  if (entry.version !== manifest.version) {
    throw new Error(`compat version ${entry.version} does not match manifest ${manifest.version}`)
  }

  const to = bumpVersion(manifest.version, bump)
  return {
    from: manifest.version,
    to,
    tag: tagFor(packageName, to),
    manifestPath,
    compatPath,
    manifest,
    compat,
    entry,
  }
}

export function applyRelease({ root: repoRoot, packageName, bump, date }) {
  const plan = planRelease({ root: repoRoot, packageName, bump })
  const changelogPath = join(repoRoot, 'packages', packageName, 'CHANGELOG.md')
  const readmePath = join(repoRoot, 'README.md')

  const nextManifest = { ...plan.manifest, version: plan.to }
  const nextCompat = {
    ...plan.compat,
    packages: { ...plan.compat.packages, [packageName]: { ...plan.entry, version: plan.to } },
  }
  const nextChangelog = ensureChangelogHeader(readFileSync(changelogPath, 'utf8'), plan.to, date)
  const nextReadme = updateReadmeTable(readFileSync(readmePath, 'utf8'), nextCompat)

  const files = [plan.manifestPath, plan.compatPath, changelogPath, readmePath]
  const previous = new Map(files.map((path) => [path, readFileSync(path, 'utf8')]))

  writeFileSync(plan.manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`)
  writeFileSync(plan.compatPath, `${JSON.stringify(nextCompat, null, 2)}\n`)
  writeFileSync(changelogPath, nextChangelog)
  writeFileSync(readmePath, nextReadme)

  return { ...plan, files, previous }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const packageName = args[0]
  const bump = args[1]
  const dryRun = args.includes('--dry-run')
  const commit = args.includes('--commit')

  if (!packageName || !bump) {
    console.error('usage: release.mjs <package> <patch|minor|major> [--dry-run] [--commit]')
    process.exit(2)
  }

  const compatPath = join(root, 'dsh-compat.json')
  const compat = JSON.parse(readFileSync(compatPath, 'utf8'))
  const verificationPath = join(root, 'docs', 'verification', `${compat.dsh}.md`)
  assertVerification(readFileSync(verificationPath, 'utf8'), compat.dsh)

  const date = new Date().toLocaleDateString('en-CA')

  if (dryRun) {
    const plan = planRelease({ root, packageName, bump })
    process.stdout.write(`${JSON.stringify({
      package: packageName,
      from: plan.from,
      to: plan.to,
      tag: plan.tag,
      changelog: `## ${plan.to} — ${date}`,
    }, null, 2)}\n`)
    process.exit(0)
  }

  const result = applyRelease({ root, packageName, bump, date })

  try {
    execFileSync('npm', ['test'], { cwd: root, stdio: 'inherit' })
    execFileSync('npm', ['run', 'pack:check'], { cwd: root, stdio: 'inherit' })
  } catch (error) {
    for (const [path, content] of result.previous) writeFileSync(path, content)
    throw error
  }

  const commands = [
    ['git', ['add', ...result.files]],
    ['git', ['commit', '-m', `chore(release): ${packageName} ${result.to}`]],
    ...(result.tag ? [['git', ['tag', result.tag]]] : []),
  ]

  if (commit) {
    for (const [command, commandArgs] of commands) {
      execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit' })
    }
  } else {
    for (const [command, commandArgs] of commands) {
      console.log(`git ${commandArgs.map((arg) => (arg.includes(' ') ? JSON.stringify(arg) : arg)).join(' ')}`)
    }
  }

  console.log(`released ${packageName} ${result.to}${result.tag ? ` (${result.tag})` : ''}`)
}
