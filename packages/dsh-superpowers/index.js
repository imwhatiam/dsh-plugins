import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBootstrapMessage, shouldInjectBootstrap } from './lib/injection.js';
import { parseSkillFile } from './lib/skills.js';
import { loadPluginState } from './lib/state.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SKILLS_DIR = join(ROOT, 'skills');

function toSummary(skill) {
  const { locator: _locator, rank: _rank, ...summary } = skill;
  return summary;
}

function createProvider(catalog) {
  return {
    name: 'superpowers',
    async list() {
      return catalog;
    },
    async get(candidate, options) {
      let raw;
      try {
        raw = await readFile(candidate.locator, { encoding: 'utf8', signal: options.signal });
      } catch (error) {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      }
      const parsed = parseSkillFile(raw, candidate.name);
      return {
        ...toSummary(candidate),
        content: parsed.body,
      };
    },
  };
}

function isRootAgent(ctx, agent) {
  return ctx.agents.roots().some((root) => root.id === agent.id);
}

function hasSkillTool(ctx, agent) {
  return ctx.tools.get('skill', agent) !== undefined;
}

export const name = 'superpowers';
export const inject = ['skills', 'agents', 'tools'];

export function apply(ctx) {
  const { catalog, bootstrap } = loadPluginState({
    skillsDir: SKILLS_DIR,
    rootDir: ROOT,
    onError: (part, error) => {
      ctx.logger?.warn?.(`superpowers: ${part} unavailable (${error.message}); continuing without it`);
    },
  });

  ctx.skills.registerProvider(() => createProvider(catalog));

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    if (decision.kind !== 'enter' || decision.messages.length === 0) return decision;

    const { agent } = payload;
    const shouldInject = shouldInjectBootstrap({
      bootstrap,
      isRootAgent: isRootAgent(ctx, agent),
      hasSkillTool: hasSkillTool(ctx, agent),
      session: agent.session,
    });
    if (!shouldInject) return decision;

    return {
      ...decision,
      messages: decision.messages.toSpliced(0, 0, createBootstrapMessage(bootstrap)),
    };
  });
}
