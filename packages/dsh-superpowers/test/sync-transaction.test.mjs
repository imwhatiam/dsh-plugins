import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMMIT = '2ce8aa15d05bd57213e6f746f953aafb7ded7a8b';

function check(cwd = ROOT) {
  return execFileSync(process.execPath, ['scripts/sync-upstream.mjs', '--check'], {
    cwd,
    encoding: 'utf8',
  });
}

test('a rejected upstream tree leaves the installed skills and manifest unchanged', () => {
  const before = check();
  const source = mkdtempSync(join(ROOT, 'tests', 'sync-fail-'));
  try {
    mkdirSync(join(source, 'skills', 'using-superpowers'), { recursive: true });
    writeFileSync(
      join(source, 'skills', 'using-superpowers', 'SKILL.md'),
      '- DeepSeek Harness: `references/dsh-tools.md`\n',
    );
    assert.throws(() => {
      execFileSync(process.execPath, [
        'scripts/sync-upstream.mjs',
        '--from', source,
        '--version', '7.0.1',
        '--commit', COMMIT,
      ], { cwd: ROOT, stdio: 'pipe' });
    }, (error) => error.status !== 0);
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
  assert.equal(check(), before);
});

test('a manifest write failure leaves the old skills and manifest intact', () => {
  const temp = mkdtempSync(join(ROOT, 'tests', 'sync-manifest-fail-'));
  try {
    cpSync(join(ROOT, 'skills'), join(temp, 'skills'), { recursive: true });
    cpSync(join(ROOT, 'scripts'), join(temp, 'scripts'), { recursive: true });
    cpSync(join(ROOT, 'UPSTREAM.json'), join(temp, 'UPSTREAM.json'));
    mkdirSync(join(temp, 'tests'), { recursive: true });
    const before = check(temp);

    chmodSync(temp, 0o555);
    try {
      assert.throws(() => {
        execFileSync(process.execPath, [
          'scripts/sync-upstream.mjs',
          '--from', ROOT,
          '--version', '7.0.1',
          '--commit', COMMIT,
        ], { cwd: temp, stdio: 'pipe' });
      }, (error) => error.status !== 0);
    } finally {
      chmodSync(temp, 0o755);
    }
    assert.equal(check(temp), before);
    assert.equal(JSON.parse(readFileSync(join(temp, 'UPSTREAM.json'), 'utf8')).version, '7.0.1');
  } finally {
    chmodSync(temp, 0o755);
    rmSync(temp, { recursive: true, force: true });
  }
});