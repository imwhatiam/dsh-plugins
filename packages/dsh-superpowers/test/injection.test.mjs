import assert from 'node:assert/strict';
import test from 'node:test';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { createBootstrapMessage, sessionHasBootstrap, shouldInjectBootstrap } from '../lib/injection.js';

const BOOTSTRAP = 'superpowers-bootstrap';

function session(history = []) {
  return { deriveMessages: () => [...history] };
}

const bootstrapHistory = () => [
  createBootstrapMessage('bootstrap text'),
  createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } }),
];

test('injects for a root agent whose history has no bootstrap', () => {
  assert.equal(
    shouldInjectBootstrap({ bootstrap: 'text', isRootAgent: true, hasSkillTool: true, session: session() }),
    true,
  );
});

test('never injects without bootstrap text', () => {
  assert.equal(
    shouldInjectBootstrap({ bootstrap: undefined, isRootAgent: true, hasSkillTool: true, session: session() }),
    false,
  );
});

test('never injects into a delegated child agent', () => {
  assert.equal(
    shouldInjectBootstrap({ bootstrap: 'text', isRootAgent: false, hasSkillTool: true, session: session() }),
    false,
  );
});

test('never injects into an agent without the skill tool', () => {
  assert.equal(
    shouldInjectBootstrap({ bootstrap: 'text', isRootAgent: true, hasSkillTool: false, session: session() }),
    false,
  );
});

test('does not inject twice into the same history', () => {
  assert.equal(sessionHasBootstrap(session(bootstrapHistory())), true);
  assert.equal(
    shouldInjectBootstrap({ bootstrap: 'text', isRootAgent: true, hasSkillTool: true, session: session(bootstrapHistory()) }),
    false,
  );
});

test('a message from another source does not count as the bootstrap', () => {
  const history = [createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })];

  assert.equal(sessionHasBootstrap(session(history)), false);
});

test('the bootstrap message is a user message from a documented context form', () => {
  const message = createBootstrapMessage('body');

  assert.equal(message.role, 'user');
  assert.equal(message.source.kind, BOOTSTRAP);
  assert.equal(message.source.form, 'instructions');
  assert.equal(message.content[0].text, 'body');
});
