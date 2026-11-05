import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function digest(file) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
}

function fileMode(file) {
  return statSync(file).mode & 0o111 ? '100755' : '100644';
}

function treeHash(files, modes) {
  const hash = createHash('sha256');
  for (const path of Object.keys(files).sort((left, right) => left.localeCompare(right))) {
    hash.update(`${path}\0${modes[path]}\0${files[path]}\n`);
  }
  return `sha256:${hash.digest('hex')}`;
}

test('a future upstream version with a changed skill set passes the dynamic tests', () => {
  const temp = mkdtempSync(join(ROOT, 'tests', 'upgrade-compat-'));
  try {
    for (const directory of ['skills', 'scripts', 'lib', 'adapter']) {
      cpSync(join(ROOT, directory), join(temp, directory), { recursive: true });
    }
    mkdirSync(join(temp, 'test'), { recursive: true });
    for (const file of ['skills.test.mjs', 'upstream.test.mjs']) {
      cpSync(join(ROOT, 'test', file), join(temp, 'test', file));
    }

    const newSkill = join(temp, 'skills', 'new-skill');
    mkdirSync(newSkill, { recursive: true });
    writeFileSync(join(newSkill, 'SKILL.md'), '---\nname: new-skill\ndescription: Future skill.\n---\n\n# New skill\n');
    rmSync(join(temp, 'skills', 'writing-skills'), { recursive: true, force: true });

    const manifest = JSON.parse(readFileSync(join(ROOT, 'UPSTREAM.json'), 'utf8'));
    manifest.version = '9.9.9';
    manifest.source.tag = 'v9.9.9';
    for (const path of Object.keys(manifest.files)) {
      if (path.startsWith('writing-skills/')) {
        delete manifest.files[path];
        delete manifest.fileModes[path];
      }
    }
    const skillFile = join(newSkill, 'SKILL.md');
    manifest.files['new-skill/SKILL.md'] = digest(skillFile);
    manifest.fileModes['new-skill/SKILL.md'] = fileMode(skillFile);
    manifest.treeHash = treeHash(manifest.files, manifest.fileModes);
    writeFileSync(join(temp, 'UPSTREAM.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ['--test', 'test/upstream.test.mjs', 'test/skills.test.mjs'], {
      cwd: temp,
      env,
      stdio: 'inherit',
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});