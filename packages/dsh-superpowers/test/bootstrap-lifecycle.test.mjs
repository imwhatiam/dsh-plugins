import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import * as plugin from '../index.js';

const BOOTSTRAP = 'superpowers-bootstrap';

/** Stand-in for a dsh Session: only the surface history matters to the plugin. */
function makeSession() {
  let history = [];
  return {
    append(_type, message) {
      history.push(message);
    },
    replace(messages) {
      history = [...messages];
    },
    deriveMessages() {
      return [...history];
    },
  };
}

function makeHarness({ roots = [], hasSkillTool = true, warn = () => {} } = {}) {
  const handlers = new Map();
  const warnings = [];
  const ctx = {
    logger: { warn: (message) => { warnings.push(message); warn(message); } },
    skills: {
      registerProvider(factory) {
        ctx.provider = factory({ signal: new AbortController().signal, invalidate: () => {} });
      },
    },
    agents: { roots: () => roots },
    tools: { get: (name) => (hasSkillTool ? { name } : undefined) },
    on(event, handler) {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
  };
  plugin.apply(ctx);
  return { ctx, warnings, preStep: handlers.get('agent/pre-step') };
}

function userMessage(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });
}

function enter(messages) {
  return { kind: 'enter', messages, assembly: {} };
}

function bootstraps(decision) {
  return decision.messages.filter((message) => message.source?.kind === BOOTSTRAP);
}

function rootHarness({ hasSkillTool = true } = {}) {
  const session = makeSession();
  const agent = { id: 'root-agent', session };
  const harness = makeHarness({ roots: [agent], hasSkillTool });
  return { ...harness, agent, session };
}

test('a root agent with the skill tool receives the bootstrap once', async () => {
  const { agent, preStep } = rootHarness();
  const decision = await preStep({ agent, turn: 1, step: 1 }, async () => enter([userMessage('hello')]));

  assert.equal(bootstraps(decision).length, 1);
  assert.equal(decision.messages.length, 2);
  assert.equal(decision.messages[0].source.kind, BOOTSTRAP, 'the bootstrap must precede the claimed input');
  assert.equal(decision.messages[0].role, 'user');
  assert.match(decision.messages[0].content[0].text, /DeepSeek Harness \(DSH\)/u);
});

test('a delegated child agent receives no bootstrap', async () => {
  const session = makeSession();
  const parent = { id: 'root-agent', session };
  const child = { id: 'child-agent', session: makeSession() };
  const { preStep } = makeHarness({ roots: [parent] });
  const decision = await preStep({ agent: child, turn: 1, step: 1 }, async () => enter([userMessage('hello')]));

  assert.equal(bootstraps(decision).length, 0);
  assert.equal(decision.messages.length, 1);
});

test('an agent without the skill tool receives no bootstrap', async () => {
  const { agent, preStep } = rootHarness({ hasSkillTool: false });
  const decision = await preStep({ agent, turn: 1, step: 1 }, async () => enter([userMessage('hello')]));

  assert.equal(bootstraps(decision).length, 0);
});

test('an empty step is left untouched', async () => {
  const { agent, preStep } = rootHarness();
  const decision = await preStep({ agent, turn: 1, step: 1 }, async () => enter([]));

  assert.equal(decision.messages.length, 0);
});

test('a rejected step is passed through', async () => {
  const { agent, preStep } = rootHarness();
  const rejected = { kind: 'reject', reason: 'no input' };
  const decision = await preStep({ agent, turn: 1, step: 1 }, async () => rejected);

  assert.deepEqual(decision, rejected);
});

test('the bootstrap is not repeated once it reached session history', async () => {
  const { agent, session, preStep } = rootHarness();
  const first = await preStep({ agent, turn: 1, step: 1 }, async () => enter([userMessage('hello')]));
  session.append('user/message', first.messages[0]);
  session.append('user/message', first.messages[1]);

  const second = await preStep({ agent, turn: 1, step: 2 }, async () => enter([userMessage('again')]));

  assert.equal(bootstraps(second).length, 0);
});

test('the bootstrap is injected again when the request failed before history was written', async () => {
  const { agent, session, preStep } = rootHarness();
  // prepareRequest failed: the loop never appended the decided messages.
  const failed = await preStep({ agent, turn: 1, step: 1 }, async () => enter([userMessage('hello')]));
  assert.equal(bootstraps(failed).length, 1);
  assert.equal(session.deriveMessages().length, 0);

  const retry = await preStep({ agent, turn: 2, step: 1 }, async () => enter([userMessage('hello again')]));

  assert.equal(bootstraps(retry).length, 1, 'a lost bootstrap must be injected on the next attempt');
  assert.equal(retry.messages[0].source.kind, BOOTSTRAP);
});

test('the bootstrap is injected again after compaction replaced it', async () => {
  const { agent, session, preStep } = rootHarness();
  const first = await preStep({ agent, turn: 1, step: 1 }, async () => enter([userMessage('hello')]));
  session.append('user/message', first.messages[0]);
  session.append('user/message', first.messages[1]);
  session.replace([createUserMessage({
    content: [{ type: 'text', text: 'summary of earlier turns' }],
    source: { kind: 'compact-checkpoint', compactionId: 'c1' },
  })]);

  const afterCompaction = await preStep({ agent, turn: 2, step: 1 }, async () => enter([userMessage('next')]));

  assert.equal(bootstraps(afterCompaction).length, 1);
  assert.equal(afterCompaction.messages[0].source.kind, BOOTSTRAP);
});

test('the skill provider serves the bundled upstream catalog', async () => {
  const { ctx } = makeHarness();
  const listed = await ctx.provider.list();
  const loaded = await ctx.provider.get(listed.find((skill) => skill.name === 'brainstorming'), {});

  assert.equal(ctx.provider.name, 'superpowers');
  assert.equal(listed.length > 0, true);
  assert.equal(listed.every((skill) => skill.source === 'bundled'), true);
  assert.equal(listed.every((skill) => skill.provider === 'superpowers'), true);
  assert.equal(loaded.name, 'brainstorming');
  assert.equal(loaded.invocation.modelInvocable, true);
  assert.equal(loaded.content.startsWith('---'), false);
});

test('a missing skill file resolves to undefined', async () => {
  const { ctx } = makeHarness();
  const loaded = await ctx.provider.get({ name: 'gone', locator: '/nonexistent/SKILL.md' }, {});

  assert.equal(loaded, undefined);
});

test('an unreadable skill file surfaces the error instead of reading as missing', async () => {
  const { ctx } = makeHarness();
  const directory = fileURLToPath(new URL('..', import.meta.url));

  await assert.rejects(
    () => ctx.provider.get({ name: 'broken', locator: directory }, {}),
    (error) => error.code === 'EISDIR',
  );
});
