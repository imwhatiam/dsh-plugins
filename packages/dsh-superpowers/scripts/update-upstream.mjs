#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions } from './semver.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'UPSTREAM.json');
const DEFAULT_REMOTE = 'https://github.com/obra/superpowers.git';
const GIT_PROXY = process.env.DSH_GIT_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY || '';
const gitArgs = (args) => (GIT_PROXY === '' ? args : ['-c', `http.proxy=${GIT_PROXY}`, ...args]);

const args = process.argv.slice(2);
const options = { check: false, remote: DEFAULT_REMOTE };
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--check') options.check = true;
  else if (args[index] === '--remote') options.remote = args[++index];
  else if (args[index] === '--help' || args[index] === '-h') {
    console.log('usage: node scripts/update-upstream.mjs [--check] [--remote <git-url>]');
    process.exit(0);
  } else {
    throw new Error(`unknown argument: ${args[index]}`);
  }
}

function tags(remote) {
  const output = execFileSync('git', gitArgs(['ls-remote', '--tags', remote]), {
    encoding: 'utf8',
    timeout: 120000,
  });
  const byTag = new Map();
  for (const line of output.split('\n')) {
    const [commit, ref] = line.split('\t');
    if (typeof ref !== 'string' || !ref.startsWith('refs/tags/')) continue;
    const peeled = ref.endsWith('^{}');
    const tag = ref.slice('refs/tags/'.length).replace(/\^\{\}$/u, '');
    const version = tag.replace(/^v/u, '');
    if (!/^\d+\.\d+\.\d+$/u.test(version)) continue;
    const entry = byTag.get(tag) ?? { tag, version };
    if (peeled || entry.commit === undefined) entry.commit = commit;
    byTag.set(tag, entry);
  }
  return [...byTag.values()];
}

const current = JSON.parse(readFileSync(MANIFEST, 'utf8')).version;
const available = tags(options.remote).sort((left, right) => compareVersions(left.version, right.version));
const latest = available.at(-1);
if (latest === undefined) throw new Error('no semver tags found');
const update = compareVersions(latest.version, current) > 0;
console.log(JSON.stringify({ current, latest: latest.version, updateAvailable: update }, null, 2));

if (options.check) process.exit(update ? 2 : 0);
if (!update) process.exit(0);

const checkout = resolve(ROOT, 'tests', `upstream-${latest.version}-${process.pid}`);
mkdirSync(join(ROOT, 'tests'), { recursive: true });
try {
  execFileSync('git', gitArgs(['clone', '--depth', '1', '--branch', latest.tag, options.remote, checkout]), {
    stdio: 'inherit',
    timeout: 120000,
  });
  execFileSync(process.execPath, ['scripts/sync-upstream.mjs', '--from', checkout, '--version', latest.version, '--commit', latest.commit], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['scripts/verify-upstream.mjs', '--from', checkout], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  const testFiles = readdirSync(join(ROOT, 'test'))
    .filter((file) => file.endsWith('.test.mjs'))
    .sort()
    .map((file) => join('test', file));
  execFileSync(process.execPath, ['--test', ...testFiles], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log(`updated to ${latest.version}; restart the profile to load the new skills`);
} finally {
  if (existsSync(checkout)) rmSync(checkout, { recursive: true, force: true });
}
