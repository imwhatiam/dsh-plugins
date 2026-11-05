import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('the vendored raw tree matches UPSTREAM.json', () => {
  const output = execFileSync(process.execPath, ['scripts/sync-upstream.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(output, /^ok \d+\.\d+\.\d+ sha256:[a-f0-9]{64}\n$/u);
});

test('UPSTREAM.json has valid, self-consistent provenance', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'UPSTREAM.json'), 'utf8'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);
  assert.equal(manifest.source.tag, `v${manifest.version}`);
  assert.match(manifest.source.commit, /^[a-f0-9]{40}$/u);
  assert.match(manifest.treeHash, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(Object.keys(manifest.files).length > 0);
  assert.equal(Object.keys(manifest.fileModes).length, Object.keys(manifest.files).length);
  assert.ok(Object.values(manifest.fileModes).every((mode) => mode === '100644' || mode === '100755'));
});

test('UPSTREAM.json contains no DSH adapter file', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'UPSTREAM.json'), 'utf8'));
  assert.equal(Object.hasOwn(manifest.files, 'using-superpowers/references/dsh-tools.md'), false);
});