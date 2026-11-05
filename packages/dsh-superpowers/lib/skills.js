import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const DEFAULT_SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === 'off' || normalized === '0') return false;
  }
  throw new Error(`invalid boolean invocation value: ${String(value)}`);
}

/**
 * Parse one SKILL.md file. The frontmatter is YAML; the returned body excludes it
 * and is not reformatted or rewritten.
 * @param {string} raw complete file contents
 * @param {string} expectedName skill directory name
 */
export function parseSkillFile(raw, expectedName) {
  const match = FRONTMATTER.exec(raw);
  if (match === null) throw new Error(`skill "${expectedName}" has no YAML frontmatter`);
  const metadata = parse(match[1]);
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`skill "${expectedName}" has invalid frontmatter`);
  }
  const name = metadata.name;
  if (typeof name !== 'string' || !SKILL_NAME.test(name)) {
    throw new Error(`skill "${expectedName}" has invalid name`);
  }
  if (name !== expectedName) {
    throw new Error(`skill "${expectedName}" declares name "${name}"`);
  }
  const description = metadata.description;
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`skill "${expectedName}" has no description`);
  }
  const whenToUse = metadata.whenToUse;
  if (whenToUse !== undefined && whenToUse !== null && typeof whenToUse !== 'string') {
    throw new Error(`skill "${expectedName}" has a non-string whenToUse`);
  }
  const skillMetadata = metadata.metadata;
  if (skillMetadata !== undefined && skillMetadata !== null
    && (typeof skillMetadata !== 'object' || Array.isArray(skillMetadata))) {
    throw new Error(`skill "${expectedName}" has non-object metadata`);
  }
  return {
    name,
    description,
    ...(whenToUse === undefined || whenToUse === null ? {} : { whenToUse }),
    ...(skillMetadata === undefined || skillMetadata === null ? {} : { metadata: skillMetadata }),
    invocation: {
      modelInvocable: !parseBoolean(metadata['disable-model-invocation'], false),
      userInvocable: parseBoolean(metadata['user-invocable'], true),
    },
    body: raw.slice(match[0].length),
  };
}

/**
 * Load every direct `<skill>/SKILL.md` under the package's skills directory.
 * One unreadable or malformed skill is reported and skipped, so a single bad
 * file removes one skill instead of the whole catalog.
 * @param {string} skillsDir absolute skill root
 * @param {{ onError?: (name: string, error: Error) => void }} [options]
 */
export function loadCatalog(skillsDir = DEFAULT_SKILLS_DIR, { onError = () => {} } = {}) {
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')
      && existsSync(join(skillsDir, entry.name, 'SKILL.md')))
    .sort((left, right) => left.name.localeCompare(right.name));
  const catalog = [];
  for (const entry of entries) {
    const directory = join(skillsDir, entry.name);
    const locator = join(directory, 'SKILL.md');
    try {
      const parsed = parseSkillFile(readFileSync(locator, 'utf8'), entry.name);
      catalog.push({
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
        ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
        invocation: parsed.invocation,
        resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
        locator,
        path: locator,
      });
    } catch (error) {
      onError(entry.name, error);
    }
  }
  return catalog;
}

export const SKILLS_DIR = DEFAULT_SKILLS_DIR;
