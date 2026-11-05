import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSkillFile } from '../lib/skills.js';

test('parses nested metadata, booleans, and multiline descriptions', () => {
  const raw = `---
name: test-skill
description: |
  A description
  across lines.
whenToUse: Use for testing.
metadata:
  category: planning
  nested:
    owner: tests
disable-model-invocation: true
user-invocable: false
---

# Body
Keep this body exactly.
`;
  const parsed = parseSkillFile(raw, 'test-skill');
  assert.equal(parsed.description, 'A description\nacross lines.\n');
  assert.equal(parsed.whenToUse, 'Use for testing.');
  assert.deepEqual(parsed.metadata, { category: 'planning', nested: { owner: 'tests' } });
  assert.deepEqual(parsed.invocation, { modelInvocable: false, userInvocable: false });
  assert.equal(parsed.body, '\n# Body\nKeep this body exactly.\n');
});

test('rejects malformed frontmatter explicitly', () => {
  assert.throws(() => parseSkillFile('no frontmatter', 'bad'), /no YAML frontmatter/u);
  assert.throws(() => parseSkillFile('---\nname: bad\n---\nbody', 'bad'), /no description/u);
});
