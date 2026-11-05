# dsh-superpowers

Superpowers skills for DeepSeek Harness. The exact upstream version and commit are recorded in `UPSTREAM.json`. This package keeps the upstream `skills/` tree byte-for-byte raw and adds a separate DSH adapter layer:

- Registers the upstream skill catalog through `ctx.skills.registerProvider`;
- Injects the `using-superpowers` bootstrap once per top-level session through `agent/pre-step`;
- Skips delegated child sessions;
- Re-injects after compaction;
- Maps Superpowers actions to DSH tools in `adapter/dsh-tools.md`.

## Versioning

`1.0.0` is the first stable release; `1.0.1` validates the plugin against DeepSeek Harness `0.2.2-rc.1`. The plugin versions on its own line; the validated DeepSeek Harness range lives in `engines.dsh` (`>=0.2.2-rc.1 <0.3.0-0`) and in the `peerDependencies` on `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-skill`. Raise that range when a newer DSH release is validated, and bump the major version only when the plugin's own behaviour changes incompatibly.

## Install

This package is local-only. Install it from this monorepo:

```bash
dsh plugin --profile superpowers-test add /path/to/dsh-plugins/packages/dsh-superpowers
```

Do not edit a profile's `package.json` or `cordis.patch.yml` by hand—use the `dsh plugin` CLI.

## Upstream updates

This package pins the upstream Superpowers release recorded in `UPSTREAM.json` with deterministic hash verification. To check for updates:

```bash
npm run update:check   # compare UPSTREAM.json with latest semver tag from obra/superpowers
npm run update         # clones tag, runs sync-upstream.mjs, re-runs tests
npm run verify:upstream -- --from /path/to/superpowers
npm test               # ensures compatibility
```

These update scripts are maintainer tools from the source checkout; they are not included in the published npm tarball.

If GitHub is only reachable through the local SOCKS tunnel, prefix the commands with `DSH_GIT_PROXY=socks5h://127.0.0.1:1080`.

After a successful update:

1. Bump `version` in `package.json`
2. Add entry to `CHANGELOG.md`
3. Tag and release: `git tag v0.2.2 && git push origin v0.2.2`
4. Update npm: `npm publish --access public`
5. Restart the DSH profile to reload the linked package

The repository includes `.github/workflows/upstream-sync.yml`: it runs weekly, checks for a new stable tag, verifies raw upstream parity, runs the full test suite, and opens a PR. It never publishes npm automatically.

## Files structure

- `skills/` — upstream Superpowers skills, byte-for-byte identical to the release in `UPSTREAM.json`
- `adapter/` — DSH-only tool mapping, path policy, and bootstrap composition
- `lib/` — DSH skill provider and bootstrap re-export
- `scripts/sync-upstream.mjs` — Raw upstream vendor script (not published)
- `scripts/update-upstream.mjs` — Automated update checker (not published)
- `scripts/verify-upstream.mjs` — Independent raw-tree parity checker (not published)
- `test/` — Unit and parity tests (not published)
- `UPSTREAM.json` — Raw upstream commit and file-hash manifest
- `cordis.patch.yml` — Bundle manifest (published)
- `LICENSE` — MIT license
- `THIRD_PARTY_NOTICES.md` — Attribution to Superpowers (obra)

## Checks

- `npm test` — 41 tests.
- `npm run sync:check` — the vendored tree matches `UPSTREAM.json`.
- `npm run verify:upstream` — byte-for-byte parity with the pinned upstream tag.

CI runs all three on every push and pull request. Nothing here publishes to npm; the plugin is installed from a local path or a GitHub tag.

## DSH specifics

- **Raw upstream**: `skills/` contains the unmodified upstream Superpowers files; DSH-only material is in `adapter/`.
- **Tool mapping**: `adapter/dsh-tools.md`; use only tools visible to the current agent and degrade when unavailable.
- **Path policy**: `adapter/path-policy.md` maps upstream `~/.superpowers` references to workspace `.superpowers/`.
- **Bootstrap source**: User-role message, injected once per session, survives replay.
- **Workspace path**: `.superpowers/` is workspace-local (add to `.gitignore`).
- **Graphviz**: Optional for `writing-skills` rendering (`dot` binary required).
- **Session storage**: Uses `$DSH_HOME/sessions/<workspace>/<id>/session.v4.jsonl.zstd`.
- **Subagents**: Bootstrap skipped in delegated children (confirmed via session logs).

## Contributing

1. Fork this repo
2. Create a feature branch: `git checkout -b feature/amazing-improvement`
3. Make changes (follow coding-discipline: surface assumptions, minimal edits, failing tests first)
4. Run tests: `npm test`
5. Submit PR
6. Wait for review

For contribution questions, open an issue in the repository.

## License

MIT License — see [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Credits

- Original Superpowers by Jesse Vincent (obra) — https://github.com/obra/superpowers
- Adapted for DeepSeek Harness by imwhatiam
- Community contributors and maintainers

---

**Disclaimer**: This plugin is not officially endorsed by DeepSeek. Install at your own risk and always verify third-party code before use.
