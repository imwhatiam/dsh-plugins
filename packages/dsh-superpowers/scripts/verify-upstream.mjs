#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS_DIR = join(ROOT, 'skills');
const MANIFEST = join(ROOT, 'UPSTREAM.json');
const UPSTREAM_URL = 'https://github.com/obra/superpowers';
const GIT_PROXY = process.env.DSH_GIT_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY || '';
const gitArgs = (args) => (GIT_PROXY === '' ? args : ['-c', `http.proxy=${GIT_PROXY}`, ...args]);

const args = process.argv.slice(2);
let from = null;
let version = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--from') from = args[++index];
  else if (args[index] === '--version') version = args[++index];
  else if (args[index] === '--help' || args[index] === '-h') {
    console.log('usage: node scripts/verify-upstream.mjs [--from <superpowers-checkout>] [--version <tag>]');
    process.exit(0);
  } else {
    throw new Error(`unknown argument: ${args[index]}`);
  }
}

function files(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`refusing symbolic link in skills tree: ${path}`);
    if (entry.isDirectory()) result.push(...files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function digest(file) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
}

function fileMode(file) {
  return statSync(file).mode & 0o111 ? '100755' : '100644';
}

function treeHash(fileMap, modeMap) {
  const hash = createHash('sha256');
  for (const [path, value] of [...fileMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${path}\0${modeMap.get(path)}\0${value}\n`);
  }
  return `sha256:${hash.digest('hex')}`;
}

function sourceCommit(source) {
  if (!existsSync(join(source, '.git'))) return null;
  return execFileSync('git', gitArgs(['-C', source, 'rev-parse', 'HEAD']), { encoding: 'utf8' }).trim();
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const tag = version ?? manifest.source.tag;

let tempDir = null;
try {
  if (from === null) {
    tempDir = join(ROOT, 'tests', `verify-upstream-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    execFileSync('git', gitArgs(['clone', '--depth', '1', '--branch', tag, UPSTREAM_URL, tempDir]), { stdio: 'inherit' });
    from = tempDir;
  }
  const sourceSkills = join(resolve(from), 'skills');
  if (!existsSync(sourceSkills)) throw new Error(`no skills directory under ${from}`);

  const sourceFiles = files(sourceSkills);
  const actualFiles = files(SKILLS_DIR);
  const source = new Map(sourceFiles.map((file) => [relative(sourceSkills, file).split('\\').join('/'), digest(file)]));
  const actual = new Map(actualFiles.map((file) => [relative(SKILLS_DIR, file).split('\\').join('/'), digest(file)]));
  const sourceModes = new Map(sourceFiles.map((file) => [relative(sourceSkills, file).split('\\').join('/'), fileMode(file)]));
  const actualModes = new Map(actualFiles.map((file) => [relative(SKILLS_DIR, file).split('\\').join('/'), fileMode(file)]));
  const sourceTreeHash = treeHash(source, sourceModes);
  const actualTreeHash = treeHash(actual, actualModes);
  const missing = [...source.keys()].filter((path) => !actual.has(path));
  const extra = [...actual.keys()].filter((path) => !source.has(path));
  const modified = [...source.keys()].filter((path) => actual.has(path) && source.get(path) !== actual.get(path));
  const modeMissing = [...sourceModes.keys()].filter((path) => !actualModes.has(path));
  const modeModified = [...sourceModes.keys()].filter((path) => actualModes.has(path) && sourceModes.get(path) !== actualModes.get(path));
  const actualCommit = sourceCommit(resolve(from));
  const manifestModes = manifest.fileModes ?? {};
  const manifestModesMatch = [...sourceModes.entries()].every(([path, mode]) => manifestModes[path] === mode)
    && Object.keys(manifestModes).length === sourceModes.size;
  const result = {
    upstream: { tag, commit: manifest.source.commit, rawTreeHash: manifest.treeHash },
    sourceCommit: actualCommit,
    commitMatches: actualCommit === null ? null : actualCommit === manifest.source.commit,
    sourceTreeHash,
    actualTreeHash,
    manifestMatchesSource: (sourceTreeHash === manifest.treeHash) && manifestModesMatch,
    sourceFiles: source.size,
    pluginFiles: actual.size,
    missing,
    extra,
    modified,
    modeMissing,
    modeModified,
    ok: (actualCommit === null || actualCommit === manifest.source.commit)
      && sourceTreeHash === manifest.treeHash
      && actualTreeHash === sourceTreeHash
      && manifestModesMatch
      && missing.length === 0
      && extra.length === 0
      && modified.length === 0
      && modeMissing.length === 0
      && modeModified.length === 0,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
} finally {
  if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
}
