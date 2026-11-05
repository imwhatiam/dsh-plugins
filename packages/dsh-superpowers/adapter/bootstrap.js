const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u;

/** Remove the YAML frontmatter from one skill body without altering its content. */
export function stripFrontmatter(raw) {
  return raw.replace(FRONTMATTER, '');
}

/**
 * Build the exact text injected as the per-session bootstrap user message.
 * The upstream skill body is preserved; adapter material is appended as a
 * separate, clearly labeled source.
 */
export function buildBootstrap(usingSuperpowersRaw, toolsMapping, pathPolicy = '') {
  const parts = [
    '<EXTREMELY_IMPORTANT>',
    'You have superpowers.',
    '',
    '**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-superpowers" again - that would be redundant.**',
    '',
    stripFrontmatter(usingSuperpowersRaw),
    '',
    '<DSH_PLATFORM_ADAPTER>',
    toolsMapping.trim(),
  ];
  if (pathPolicy.trim() !== '') {
    parts.push('', pathPolicy.trim());
  }
  parts.push('</DSH_PLATFORM_ADAPTER>', '</EXTREMELY_IMPORTANT>');
  return parts.join('\n');
}
