import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const packagesDir = join(root, 'packages')
const problems = []

for (const dir of readdirSync(packagesDir)) {
  const manifestPath = join(packagesDir, dir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const require = (condition, message) => { if (!condition) problems.push(`${dir}: ${message}`) }

  require(typeof manifest.name === 'string' && manifest.name.length > 0, 'missing name')
  require(typeof manifest.version === 'string', 'missing version')
  require(manifest.license === 'MIT', 'license must be MIT')
  require(manifest.engines?.dsh, 'missing engines.dsh')
  require(manifest.dsh?.bundle?.patch, 'missing dsh.bundle.patch')
  require(manifest.scripts?.test, 'missing scripts.test')
  require(manifest.scripts?.['pack:check'], 'missing scripts["pack:check"]')
  require(manifest.repository?.directory === `packages/${dir}`, 'repository.directory mismatch')
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('package metadata ok')
