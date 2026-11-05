import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

export function assertVerification(text, version) {
  if (!text.includes(version)) throw new Error(`verification record does not mention ${version}`)
  if (!/status:\s*passed/i.test(text)) throw new Error('verification record is not status: passed')
}

export function recordVerified({ compat, packageName, packageJson, dsh, today }) {
  return {
    ...compat,
    dsh,
    verifiedAt: today,
    packages: {
      ...compat.packages,
      [packageName]: {
        ...(compat.packages[packageName] ?? {}),
        version: packageJson.version,
        engines: packageJson.engines.dsh,
      },
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const value = (flag) => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
  }
  const dsh = value('--dsh')
  const packageName = value('--package')

  if (!dsh || !packageName) {
    console.error('usage: record.mjs --dsh <version> --package <name>')
    process.exit(2)
  }

  const verification = readFileSync(join(root, 'docs', 'verification', `${dsh}.md`), 'utf8')
  assertVerification(verification, dsh)

  const packageJson = JSON.parse(readFileSync(join(root, 'packages', packageName, 'package.json'), 'utf8'))
  const compatPath = join(root, 'dsh-compat.json')
  const compat = JSON.parse(readFileSync(compatPath, 'utf8'))
  const next = recordVerified({
    compat,
    packageName,
    packageJson,
    dsh,
    today: new Date().toISOString().slice(0, 10),
  })

  const tmp = `${compatPath}.tmp`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(tmp, compatPath)
  console.log(`recorded ${packageName} at ${dsh}`)
}
