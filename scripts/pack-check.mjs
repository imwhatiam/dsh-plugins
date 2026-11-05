import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const required = {
  'dsh-mosaic': [
    'package.json', 'cordis.patch.yml', 'README.md', 'LICENSE',
    'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md',
    'lib/assets/mermaid.min.js', 'screenshots.json', 'assets/screenshots/preview.jpg',
  ],
  'dsh-superpowers': [
    'package.json', 'cordis.patch.yml', 'README.md', 'LICENSE',
    'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md',
    'index.js', 'UPSTREAM.json', 'skills/brainstorming/SKILL.md',
  ],
  'dsh-view-background-jobs': [
    'package.json', 'cordis.patch.yml', 'README.md', 'LICENSE',
    'CHANGELOG.md', 'index.js', 'client.js', 'locale/en.json',
  ],
}[manifest.name]

if (!required) {
  console.error(`no pack rules for ${manifest.name}`)
  process.exit(1)
}

const output = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
const files = new Set(JSON.parse(output)[0].files.map((entry) => entry.path))
const missing = required.filter((path) => !files.has(path))

if (missing.length > 0) {
  console.error(`${manifest.name} tarball is missing:\n${missing.join('\n')}`)
  process.exit(1)
}
console.log(`${manifest.name} tarball ok`)
