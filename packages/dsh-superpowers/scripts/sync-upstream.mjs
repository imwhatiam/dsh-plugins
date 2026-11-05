#!/usr/bin/env node
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions } from './semver.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS_DIR = join(ROOT, 'skills');
const MANIFEST = join(ROOT, 'UPSTREAM.json');
const UPSTREAM_URL = 'https://github.com/obra/superpowers';
const GIT_PROXY = process.env.DSH_GIT_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY || '';
const gitArgs = (args) => (GIT_PROXY === '' ? args : ['-c', `http.proxy=${GIT_PROXY}`, ...args]);

const args = process.argv.slice(2);
const options = { check: false, from: null, version: '7.0.1', commit: null };
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--check') options.check = true;
  else if (arg === '--from') options.from = args[++index];
  else if (arg === '--version') options.version = args[++index];
  else if (arg === '--commit') options.commit = args[++index];
  else if (arg === '--help' || arg === '-h') {
    console.log('usage: node scripts/sync-upstream.mjs [--check] [--from <superpowers-checkout>] [--version <tag>] [--commit <sha>]');
    console.log('  --from      local checkout containing skills/');
    console.log('  --version   explicit tag/version');
    console.log('  --commit    full upstream commit for the manifest');
    process.exit(0);
  } else {
    throw new Error(`unknown argument: ${arg}`);
  }
}
options.version = String(options.version).replace(/^v/u, '');

function sha256(file) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`refusing symbolic link in skills tree: ${path}`);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function fileMode(file) {
  return statSync(file).mode & 0o111 ? '100755' : '100644';
}

function treeHash(skillsDirectory) {
  const entries = listFiles(skillsDirectory)
    .map((file) => [
      relative(skillsDirectory, file).split('\\').join('/'),
      sha256(file),
      fileMode(file),
    ])
    .sort(([left], [right]) => left.localeCompare(right));
  const digest = createHash('sha256');
  for (const [path, hash, mode] of entries) digest.update(`${path}\0${mode}\0${hash}\n`);
  return {
    treeHash: `sha256:${digest.digest('hex')}`,
    files: Object.fromEntries(entries.map(([path, hash]) => [path, hash])),
    fileModes: Object.fromEntries(entries.map(([path, , mode]) => [path, mode])),
  };
}

function assertRaw(directory) {
  if (existsSync(join(directory, 'using-superpowers', 'references', 'dsh-tools.md'))) {
    throw new Error('skills/ contains adapter/dsh-tools.md; upstream skills must remain untouched');
  }
  const using = readFileSync(join(directory, 'using-superpowers', 'SKILL.md'), 'utf8');
  if (using.includes('- DeepSeek Harness: `references/dsh-tools.md`')) {
    throw new Error('skills/using-superpowers/SKILL.md contains a DSH-specific pointer');
  }
}

function sourceCommit(source) {
  if (options.commit) return options.commit;
  if (existsSync(join(source, '.git'))) {
    return execFileSync('git', gitArgs(['-C', source, 'rev-parse', 'HEAD']), { encoding: 'utf8' }).trim();
  }
  throw new Error('sync from a non-git source requires --commit <40-hex upstream commit>');
}

if (options.check) {
  assertRaw(SKILLS_DIR);
  if (!existsSync(MANIFEST)) throw new Error('UPSTREAM.json does not exist');
  const expected = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const actual = treeHash(SKILLS_DIR);
  if (expected.treeHash !== actual.treeHash) {
    throw new Error(`skills tree does not match UPSTREAM.json (expected ${expected.treeHash}, got ${actual.treeHash})`);
  }
  console.log(`ok ${expected.version} ${expected.treeHash}`);
  process.exit(0);
}

let tempDir = null;
if (!options.from) {
  console.log('Fetching latest tag from upstream...');
  try {
    const tags = execFileSync('git', gitArgs(['ls-remote', '--tags', UPSTREAM_URL]), { encoding: 'utf8' });
    const byTag = new Map();
    for (const line of tags.split('\n')) {
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
    const sorted = [...byTag.values()].sort((a, b) => compareVersions(a.version, b.version)).pop();
    if (sorted === undefined) throw new Error('No tags found');
    options.version = sorted.version;
    options.commit = sorted.commit;
    const latestTag = sorted.tag;
    console.log(`Found latest tag: ${latestTag} (${options.commit.substring(0, 7)})`);

    tempDir = join(ROOT, 'tests', `sync-temp-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    execFileSync('git', gitArgs(['clone', '--depth', '1', '--branch', latestTag, UPSTREAM_URL, tempDir]), { stdio: 'inherit' });
    options.from = resolve(tempDir);
  } catch (e) {
    if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Failed to fetch from git: ${e.message}`);
  }
}

const source = resolve(options.from);
const sourceSkills = join(source, 'skills');
if (!existsSync(sourceSkills) || !statSync(sourceSkills).isDirectory()) {
  if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
  throw new Error(`no skills directory under ${source}`);
}
const commit = sourceCommit(source);

mkdirSync(join(ROOT, 'tests'), { recursive: true });
const staging = join(ROOT, 'tests', `skills-staging-${Date.now()}`);
const backup = join(ROOT, 'tests', `skills-backup-${Date.now()}`);
const manifestTemp = join(ROOT, `UPSTREAM.${process.pid}.${Date.now()}.tmp`);
const manifestBackup = join(ROOT, `UPSTREAM.${process.pid}.${Date.now()}.bak`);
let oldMoved = false;
let oldManifest = false;
try {
  cpSync(sourceSkills, staging, { recursive: true });
  assertRaw(staging);
  const { treeHash: digest, files, fileModes } = treeHash(staging);
  const manifest = {
    upstream: UPSTREAM_URL,
    version: options.version,
    source: {
      type: 'git',
      url: UPSTREAM_URL,
      tag: `v${options.version}`,
      commit,
    },
    syncedAt: new Date().toISOString(),
    treeHash: digest,
    files,
    fileModes,
  };

  writeFileSync(manifestTemp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  JSON.parse(readFileSync(manifestTemp, 'utf8'));
  if (existsSync(MANIFEST)) {
    copyFileSync(MANIFEST, manifestBackup);
    oldManifest = true;
  }

  if (existsSync(SKILLS_DIR)) {
    renameSync(SKILLS_DIR, backup);
    oldMoved = true;
  }
  try {
    renameSync(staging, SKILLS_DIR);
    renameSync(manifestTemp, MANIFEST);
  } catch (error) {
    rmSync(SKILLS_DIR, { recursive: true, force: true });
    if (oldMoved) renameSync(backup, SKILLS_DIR);
    if (oldManifest) copyFileSync(manifestBackup, MANIFEST);
    else rmSync(MANIFEST, { force: true });
    throw error;
  }
  if (oldMoved) rmSync(backup, { recursive: true, force: true });
  if (oldManifest) rmSync(manifestBackup, { force: true });
  if (existsSync(join(source, 'LICENSE'))) cpSync(join(source, 'LICENSE'), join(ROOT, 'LICENSE'));
  console.log(`synced ${options.version} ${digest}`);
} finally {
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  if (oldMoved && existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  if (existsSync(manifestTemp)) rmSync(manifestTemp, { force: true });
  if (existsSync(manifestBackup)) rmSync(manifestBackup, { force: true });
  if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
}
