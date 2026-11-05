import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

  const manifestPath = join(root, 'packages', packageName, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const compatPath = join(root, 'dsh-compat.json')
  const compat = JSON.parse(readFileSync(compatPath, 'utf8'))
  const entry = compat.packages[packageName]

  if (!entry) throw new Error(`dsh-compat.json has no entry for ${packageName}`)
  if (!compat.dsh) throw new Error('dsh-compat.json has no verified DSH version')
  if (entry.version !== manifest.version) {
    throw new Error(`compat version ${entry.version} does not match manifest ${manifest.version}`)
  }

  const nextVersion = bumpVersion(manifest.version, bump)
  const tag = tagFor(packageName, nextVersion)
  const date = new Date().toLocaleDateString('en-CA')

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      package: packageName,
      from: manifest.version,
      to: nextVersion,
      tag,
      changelog: `## ${nextVersion} — ${date}`,
    }, null, 2)}\n`)
    process.exit(0)
  }

  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version: nextVersion }, null, 2)}\n`)
  writeFileSync(compatPath, `${JSON.stringify({
    ...compat,
    packages: { ...compat.packages, [packageName]: { ...entry, version: nextVersion } },
  }, null, 2)}\n`)

  const changelogPath = join(root, 'packages', packageName, 'CHANGELOG.md')
  const changelog = readFileSync(changelogPath, 'utf8')
  writeFileSync(changelogPath, ensureChangelogHeader(changelog, nextVersion, date))

  execFileSync('npm', ['test'], { cwd: root, stdio: 'inherit' })
  execFileSync('npm', ['run', 'pack:check'], { cwd: root, stdio: 'inherit' })

  const files = [
    manifestPath,
    compatPath,
    changelogPath,
  ]
  const commands = [
    ['git', ['add', ...files]],
    ['git', ['commit', '-m', `chore(release): ${packageName} ${nextVersion}`]],
    ...(tag ? [['git', ['tag', tag]]] : []),
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

  console.log(`released ${packageName} ${nextVersion}${tag ? ` (${tag})` : ''}`)
}
