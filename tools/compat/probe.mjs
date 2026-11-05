import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProfileManifest, parseDumpConfigRows, assertBundleRows, parseWebUrl, assertWebProfile, assertRequestedVersion } from './probe-lib.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const compat = JSON.parse(readFileSync(join(root, 'dsh-compat.json'), 'utf8'))
const args = process.argv.slice(2)
const value = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
const dryRun = args.includes('--dry-run')
const keep = args.includes('--keep')
const dshVersion = value('--dsh') ?? compat.dsh
const dshBin = value('--dsh-bin') ?? process.env.DSH_BIN
const packageNames = ['dsh-mosaic', 'dsh-superpowers', 'dsh-view-background-jobs']

function hasDshOnPath() {
  return spawnSync('dsh', ['--version'], { stdio: 'ignore' }).status === 0
}

function dshCommand() {
  if (dshBin) return { command: dshBin, prefix: [] }
  if (hasDshOnPath()) return { command: 'dsh', prefix: [] }
  return { command: 'npx', prefix: ['-y', `@deepseek-ai/dsh@${dshVersion}`] }
}

function runDsh(extra, env) {
  const { command, prefix } = dshCommand()
  const result = spawnSync(command, [...prefix, ...extra], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120000,
  })
  if (result.status !== 0) {
    throw new Error(`dsh ${extra.join(' ')} failed (${result.status})\n${result.stdout}\n${result.stderr}`)
  }
  return result
}


function readDshVersion() {
  const { command, prefix } = dshCommand()
  const result = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8', timeout: 120000 })
  if (result.status !== 0) {
    throw new Error(`dsh --version failed (${result.status})\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim().split('\n').filter(Boolean).pop().trim()
}

function placeholderManifest() {
  const template = {
    name: 'dsh-profile-probe',
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }
  return buildProfileManifest(template, packageNames.map((name) => ({
    name,
    tarball: `.compat-tmp/${name}.tgz`,
  })))
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify(placeholderManifest(), null, 2)}\n`)
  process.exit(0)
}

const tmp = join(root, '.compat-tmp', `probe-${process.pid}`)
const home = join(tmp, 'home')
const profileDir = join(home, 'profiles', 'probe')

const actualVersion = readDshVersion()
assertRequestedVersion(dshVersion, actualVersion)

function pack(name) {
  const output = execFileSync('npm', ['pack', '--pack-destination', tmp], {
    cwd: join(root, 'packages', name),
    encoding: 'utf8',
    timeout: 120000,
  }).trim()
  return join(tmp, output.split('\n').pop().trim())
}

let webChild = null

try {
  mkdirSync(home, { recursive: true })
  runDsh(['--profile', 'probe', '--from-default-profile', 'web', '--dump-config'], { DSH_HOME: home })

  const manifestPath = join(profileDir, 'package.json')
  const template = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assertWebProfile(template)
  const packages = packageNames.map((name) => ({ name, tarball: pack(name) }))
  writeFileSync(manifestPath, `${JSON.stringify(buildProfileManifest(template, packages), null, 2)}\n`)

  execFileSync('npm', ['install', '--prefix', profileDir, '--no-audit', '--no-fund'], {
    encoding: 'utf8',
    timeout: 300000,
  })

  const dump = runDsh(['--profile', 'probe', '--dump-config'], { DSH_HOME: home })
  assertBundleRows(parseDumpConfigRows(dump.stdout), [
    { id: 'mosaic', name: 'dsh-mosaic' },
    { id: 'superpowers', name: 'dsh-superpowers' },
    { id: 'background-jobs', name: 'dsh-view-background-jobs' },
  ])

  const { command, prefix } = dshCommand()
  webChild = spawn(command, [...prefix, '--profile', 'probe', '--port', '0', '--no-open'], {
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  webChild.stdout.on('data', (chunk) => { stdout += chunk })
  webChild.stderr.on('data', (chunk) => { stderr += chunk })

  const url = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error(`web did not start in 30s\n${stdout}\n${stderr}`))
    }, 30000)
    const poll = setInterval(() => {
      const found = parseWebUrl(stdout)
      if (found) {
        clearInterval(poll)
        clearTimeout(deadline)
        resolve(found)
      }
    }, 100)
    webChild.on('error', (error) => {
      clearInterval(poll)
      clearTimeout(deadline)
      reject(error)
    })
    webChild.on('exit', (code) => {
      if (code !== 0 && !parseWebUrl(stdout)) {
        clearInterval(poll)
        clearTimeout(deadline)
        reject(new Error(`web exited early (${code})\n${stdout}\n${stderr}`))
      }
    })
  })

  webChild.kill('SIGTERM')

  if (/(dsh-mosaic|dsh-superpowers|dsh-view-background-jobs)[^\n]*error|error[^\n]*(dsh-mosaic|dsh-superpowers|dsh-view-background-jobs)/i.test(stderr)) {
    throw new Error(`plugin load error\n${stderr}`)
  }

  process.stdout.write(`${JSON.stringify({ ok: true, dsh: actualVersion, profile: profileDir, url })}\n`)
} finally {
  if (webChild && webChild.pid && webChild.exitCode === null) {
    webChild.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        webChild.kill('SIGKILL')
        resolve()
      }, 2000)
      webChild.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  if (!keep) rmSync(tmp, { recursive: true, force: true })
}
