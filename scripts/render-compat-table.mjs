import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function renderTable(data) {
  const rows = Object.entries(data.packages).map(([name, entry]) =>
    `| \`${name}\` | ${entry.version} | ${data.dsh} | \`${entry.engines}\` |`)
  return ['| Package | Version | Verified DSH | engines.dsh |', '| --- | --- | --- | --- |', ...rows].join('\n')
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isCli) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const compat = JSON.parse(readFileSync(join(root, 'dsh-compat.json'), 'utf8'))
  const check = process.argv.includes('--check')
  const block = `<!-- compat:begin -->\n${renderTable(compat)}\n<!-- compat:end -->`
  const readmePath = join(root, 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  const next = readme.includes('<!-- compat:begin -->')
    ? readme.replace(/<!-- compat:begin -->[\s\S]*?<!-- compat:end -->/, block)
    : `${readme.trimEnd()}\n\n${block}\n`

  if (check) {
    if (readme !== next) {
      console.error('README compat table is stale; run node scripts/render-compat-table.mjs')
      process.exit(1)
    }
    console.log('README compat table ok')
  } else {
    writeFileSync(readmePath, next)
    console.log('README compat table updated')
  }
}
