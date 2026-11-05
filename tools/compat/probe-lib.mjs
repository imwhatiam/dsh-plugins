export function buildProfileManifest(template, packages) {
  const next = {
    ...template,
    dependencies: { ...(template.dependencies ?? {}) },
    dsh: {
      ...template.dsh,
      profile: {
        ...template.dsh?.profile,
        bundles: [...(template.dsh?.profile?.bundles ?? [])],
      },
    },
  }

  for (const pkg of packages) {
    next.dependencies[pkg.name] = `file:${pkg.tarball}`
    if (!next.dsh.profile.bundles.includes(pkg.name)) next.dsh.profile.bundles.push(pkg.name)
  }

  return next
}

export function parseDumpConfigRows(text) {
  const rows = []
  let current = null

  for (const line of text.split('\n')) {
    const id = line.match(/^- id:\s*(\S+)\s*$/)
    if (id) {
      current = { id: id[1] }
      rows.push(current)
      continue
    }

    const name = line.match(/^\s+name:\s*['"]?([^'"]+)['"]?\s*$/)
    if (name && current && current.name === undefined) current.name = name[1]
  }

  return rows
}

export function assertBundleRows(rows, expected) {
  for (const want of expected) {
    const found = rows.some((row) => row.id === want.id && (want.name === undefined || row.name === want.name))
    if (!found) throw new Error(`missing bundle row: ${want.id}${want.name ? ` (${want.name})` : ''}`)
  }
}

export function parseWebUrl(stdout) {
  const match = stdout.match(/https?:\/\/127\.0\.0\.1:\d+/)
  return match ? match[0] : null
}

export function assertWebProfile(manifest) {
  const bundles = manifest?.dsh?.profile?.bundles ?? []
  if (!bundles.includes('@deepseek-ai/dsh-web-app')) {
    throw new Error('probe profile does not include @deepseek-ai/dsh-web-app')
  }
}

export function assertRequestedVersion(requested, actual) {
  if (!/^\d+\.\d+\.\d+/.test(requested)) return
  if (requested !== actual) {
    throw new Error(`requested DSH ${requested} but the CLI reports ${actual}`)
  }
}
