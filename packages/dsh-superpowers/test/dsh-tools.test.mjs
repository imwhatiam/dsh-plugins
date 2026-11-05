import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const mapping = readFileSync(join(ROOT, 'adapter', 'dsh-tools.md'), 'utf8');
const contract = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'dsh-tools.0.2.2.json'), 'utf8'));

const groups = {
  base: contract.baseTools,
  preset: contract.presetTools,
  optional: contract.optionalTools,
  optIn: contract.optInTools,
};

test('the mapping names every tool in the reviewed 0.2.2 contract', () => {
  for (const tools of Object.values(groups)) {
    for (const tool of Object.keys(tools)) {
      assert.match(mapping, new RegExp(`\`${tool}\``, 'u'), `missing ${tool}`);
    }
  }
});

test('every contract group is described by the fixture itself', () => {
  for (const group of Object.keys(groups)) {
    assert.equal(typeof contract.groups[group], 'string', `group "${group}" has no description`);
  }
});

test('core tool parameter contracts match the reviewed 0.2.2 contract', () => {
  assert.deepEqual(contract.baseTools.read.required, ['file_path']);
  assert.deepEqual(contract.baseTools.write.required, ['file_path', 'content']);
  assert.deepEqual(contract.baseTools.edit.required, ['file_path', 'old_string', 'new_string']);
  assert.deepEqual(contract.baseTools.skill.required, ['name']);
  assert.deepEqual(contract.baseTools.subagent.required, ['prompt']);
  assert.deepEqual(contract.baseTools.workflow.required, ['script', 'meta']);
  assert.deepEqual(contract.presetTools.list_subagent_models.required, []);
  assert.deepEqual(contract.optionalTools.apply_patch.required, ['input']);
});

test('the mapping marks the session tools as opt-in and names their bundle', () => {
  assert.match(mapping, /Session history tools are optional/u);
  assert.match(mapping, /@deepseek-ai\/dsh-tool-session-query/u);
  assert.match(mapping, /dsh-experimental-session-search/u);
  assert.equal(Object.keys(contract.optInTools).length, 5, '0.2.2-rc.1 registers five session tools');
});

test('the mapping keeps the visibility rule that makes an absent tool harmless', () => {
  assert.match(mapping, /Use only the tools actually visible to the current agent/u);
  assert.match(mapping, /a profile or agent preset can drop/u);
});
