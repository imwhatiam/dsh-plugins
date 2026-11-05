import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, parseSkillFile } from '../lib/skills.js';
import { buildBootstrap } from '../lib/bootstrap.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const catalog = loadCatalog(join(ROOT, 'skills'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'UPSTREAM.json'), 'utf8'));
const EXPECTED = [
  ...new Set(
    Object.keys(manifest.files)
      .filter((file) => file.endsWith('/SKILL.md'))
      .map((file) => file.split('/')[0]),
  ),
].sort();

test('catalogs exactly the upstream skill names from the manifest', () => {
  assert.deepEqual(catalog.map((skill) => skill.name), EXPECTED);
});

test('each skill parses and keeps a resource directory', () => {
  for (const skill of catalog) {
    assert.equal(skill.description.length > 0, true);
    assert.equal(skill.resourceBase.kind, 'directory');
    assert.equal(typeof skill.resourceBase.path, 'string');
    assert.equal(typeof skill.locator, 'string');
    const parsed = parseSkillFile(readFileSync(skill.path, 'utf8'), skill.name);
    assert.equal(parsed.body.startsWith('---'), false);
  }
});

test('the upstream skills stay raw and the DSH mapping lives in adapter/', () => {
  const using = readFileSync(join(ROOT, 'skills', 'using-superpowers', 'SKILL.md'), 'utf8');
  assert.equal(using.includes('- DeepSeek Harness: `references/dsh-tools.md`'), false);
  const mapping = readFileSync(join(ROOT, 'adapter', 'dsh-tools.md'), 'utf8');
  assert.match(mapping, /`subagent`/u);
  assert.match(mapping, /`todo_write`/u);
  assert.match(mapping, /`bash`/u);
});

test('diagnosing-superpowers keeps the upstream home path in skills and overrides it in adapter', () => {
  const root = join(ROOT, 'skills', 'diagnosing-superpowers');
  for (const relative of ['SKILL.md', 'templates/case.md', 'templates/report.md']) {
    const text = readFileSync(join(root, relative), 'utf8');
    assert.match(text, /~\/\.superpowers/u);
  }
  const policy = readFileSync(join(ROOT, 'adapter', 'path-policy.md'), 'utf8');
  assert.match(policy, /\.superpowers\/diagnosing-superpowers/u);
});

test('bootstrap keeps the upstream body and adds the DSH adapter', () => {
  const root = join(ROOT, 'skills', 'using-superpowers');
  const bootstrap = buildBootstrap(
    readFileSync(join(root, 'SKILL.md'), 'utf8'),
    readFileSync(join(ROOT, 'adapter', 'dsh-tools.md'), 'utf8'),
    readFileSync(join(ROOT, 'adapter', 'path-policy.md'), 'utf8'),
  );
  assert.match(bootstrap, /^<EXTREMELY_IMPORTANT>/u);
  assert.match(bootstrap, /You have superpowers\./u);
  assert.match(bootstrap, /<DSH_PLATFORM_ADAPTER>/u);
  assert.match(bootstrap, /# DeepSeek Harness \(DSH\) Tool Mapping/u);
  assert.match(bootstrap, /<\/DSH_PLATFORM_ADAPTER>/u);
  assert.match(bootstrap, /<\/EXTREMELY_IMPORTANT>$/u);
  assert.equal(bootstrap.startsWith('---'), false);
  assert.ok(bootstrap.length > 5000);
});