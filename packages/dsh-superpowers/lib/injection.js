import { createUserMessage } from '@deepseek-ai/dsh-llm';

const BOOTSTRAP_SOURCE = 'superpowers-bootstrap';

/**
 * Whether this plugin's bootstrap message is still part of the session history.
 * History is the only authority: a message the loop never appended (a first
 * request that failed or was cancelled) and a message a compaction replaced are
 * both absent from it, so the next step injects the bootstrap again instead of
 * dropping it silently.
 * @param session the agent's session
 * @returns whether a message produced by this plugin is still in the history
 */
export function sessionHasBootstrap(session) {
  return session.deriveMessages().some((message) => message.source?.kind === BOOTSTRAP_SOURCE);
}

/**
 * Whether this step should carry the bootstrap. A plugin that failed to load its
 * bootstrap text cannot inject one, and a delegated child agent or an agent
 * without the `skill` tool has nothing to use it with.
 * @param {{ bootstrap: string | undefined, isRootAgent: boolean, hasSkillTool: boolean, session: object }} input
 * @returns whether to prepend the bootstrap to this step
 */
export function shouldInjectBootstrap({ bootstrap, isRootAgent, hasSkillTool, session }) {
  if (bootstrap === undefined) return false;
  if (!isRootAgent || !hasSkillTool) return false;
  return !sessionHasBootstrap(session);
}

/**
 * Build the user message that carries the bootstrap.
 * @param bootstrap the assembled upstream skill plus DSH adapter text
 */
export function createBootstrapMessage(bootstrap) {
  return createUserMessage({
    content: [{ type: 'text', text: bootstrap }],
    source: { kind: BOOTSTRAP_SOURCE, form: 'instructions' },
  });
}
