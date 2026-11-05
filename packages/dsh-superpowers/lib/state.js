import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill';
import { buildBootstrap } from './bootstrap.js';
import { loadCatalog } from './skills.js';

/**
 * Load the vendored catalog and the bootstrap text, degrading each part on its
 * own so a broken file cannot fail the host that loads this plugin. A single
 * malformed skill is reported as `skill:<name>` and skipped; `catalog` is only
 * reported when the skills directory itself cannot be read.
 * @param {{ skillsDir: string, rootDir: string, onError?: (part: string, error: Error) => void }} options
 * @returns {{ catalog: object[], bootstrap: string | undefined }} the parts that loaded
 */
export function loadPluginState({ skillsDir, rootDir, onError = () => {} }) {
  let catalog = [];
  let bootstrap;

  try {
    catalog = loadCatalog(skillsDir, {
      onError: (name, error) => onError(`skill:${name}`, error),
    }).map((skill) => ({ ...skill, source: 'bundled', provider: 'superpowers', rank: BUNDLED_SKILL_RANK }));
  } catch (error) {
    onError('catalog', error);
  }

  try {
    bootstrap = buildBootstrap(
      readFileSync(join(skillsDir, 'using-superpowers', 'SKILL.md'), 'utf8'),
      readFileSync(join(rootDir, 'adapter', 'dsh-tools.md'), 'utf8'),
      readFileSync(join(rootDir, 'adapter', 'path-policy.md'), 'utf8'),
    );
  } catch (error) {
    onError('bootstrap', error);
  }

  return { catalog, bootstrap };
}
