# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-11-05

### Changed
- Raised `engines.dsh` to `>=0.2.2-rc.1 <0.3.0-0` and moved the `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, and `@deepseek-ai/dsh-skill` peer and dev dependencies to the 0.2.2-rc.1 line.
- Renamed the tool-contract fixture to `dsh-tools.0.2.2.json` and refreshed its source label. The reviewed tool set did not change in 0.2.2-rc.1: `apply_patch` is still off in the shipped defaults, `list_agents` is still registered by `tool-subagent-control`, and the five session tools are unchanged.
- Documented `apply_patch` (opt-in), `list_subagent_models`, and `workflow` in `adapter/dsh-tools.md`.

### Verified
- `npm test` passes against `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-skill` 0.2.2-rc.1: 41 tests.
- `npm run sync:check` still matches the pinned upstream tree.
- A 0.2.2-rc.1 desktop session injected the bootstrap once (`form: 'instructions'`) and served `brainstorming` and `writing-plans` through the `skill` tool with the packaged `resourceBase`.

## [1.0.0] - 2026-11-02

### Fixed
- The bootstrap no longer records a session as injected before the message reaches session history. A first request that fails in `prepareRequest`, or a turn cancelled before the messages were appended, used to lose the bootstrap for the rest of the session without any error; the next step now injects it again.
- Injection state is derived from `Session.deriveMessages()` only. The removed `WeakSet` and its `session/event` compaction hook could disagree with the history after compaction or abort.
- A malformed or unreadable `SKILL.md` now costs one skill instead of the whole catalog. `loadCatalog()` reports the failing directory as `skill:<name>` and keeps loading its siblings; the `catalog` failure is reserved for an unreadable skills directory.

### Changed
- The plugin versions on its own line from this release. The validated DeepSeek Harness range stays in
  `engines.dsh` and the `@deepseek-ai/dsh-*` peer dependencies.
- The bootstrap message source uses `form: 'instructions'`, one of the documented context forms, instead of the undefined `'bootstrap'`.
- `insertionIndex()` was removed: `agent/pre-step` receives claimed inbox messages, never a compaction checkpoint, so the index was always `0`. The bootstrap stays after the checkpoint because it is appended to the history that the checkpoint already replaced.
- `adapter/dsh-tools.md` names the tools that come from optional DSH plugins (jobs, subagent, web) so skills do not assume a profile mounts them.
- The session-history section now says those tools are opt-in (mounted by the experimental `dsh-experimental-session-search` bundle), lists all five including `session_event_trace`, and points at the persisted log when they are absent. It also separates `subagent` from `subagent_fork`, which is a second instance of the same plugin rather than a variant.

### Added
- `lib/state.js` loads the catalog and the bootstrap text independently and degrades with a logged warning instead of failing the host when a skill file or an adapter file is unreadable.
- Bootstrap lifecycle tests: injection for a root agent, no injection for a child agent or an agent without the `skill` tool, no repetition, re-injection after a failed request, and re-injection after compaction.
- `tests/.gitkeep` so a clean clone has the `tests/` directory three tests need; without it `npm test` failed on a fresh checkout.
- A `CI` workflow runs tests, the manifest check, and raw upstream parity on every push and pull request.
- `test/fixtures/mixed-skills` plus a state test that proves a healthy skill still loads next to a broken one.
- The tool-contract fixture now splits `baseTools`, `presetTools`, and `optInTools`, and the mapping test checks every group, so a dropped session tool fails the suite.

### Verified
- Loaded on the shipped `headless` profile of DeepSeek Harness 0.2.1-rc.5 through a `--patch` overlay: the bootstrap was injected once (`form: 'instructions'`), stayed single across three turns, the skill catalog served 21 skills, and a real `skill` call returned the skill body with the packaged `resourceBase`.
- Replayed a real, manually compacted session log read-only: its original bootstrap sat inside the shadowed range, the reconstructed history matched the host's own shadow list, and the predicate returned "inject" straight after the checkpoint and "do not inject" once the bootstrap was back.
- Re-ran the headless profile after the adapter rewrite: the injected text carries the opt-in wording and all five session tool names, and the catalog still serves all 15 vendored skills.

## [0.2.1] - 2026-10-30

### Changed
- Aligned the plugin version with the DeepSeek Harness 0.2.1 release line.
- Validated against DeepSeek Harness v0.2.1-rc.5 source and documentation.
- Updated package metadata for the rc.5 peer/dev dependency ranges and bundle manifest.
- Aligned skill provider candidate/resource-base handling with the rc.5 skill provider pattern.
- Added the version-sync policy to the README: future DSH validation bumps the plugin version to the validated DSH base version.
- Separated the raw upstream `skills/` tree from the DSH `adapter/`; the four DSH text patches now live in the adapter/bootstrap layer.
- Added a raw upstream manifest keyed by the full v7.0.1 commit, SHA-256 content hashes, and `100644`/`100755` file modes.
- Switched Frontmatter parsing to YAML and added `metadata`/multi-line support.
- Made upstream sync stage and validate before replacing `skills/`; update now runs the full test suite.
- Added the weekly `upstream-sync` GitHub Actions workflow, which opens a PR and does not publish npm automatically.
- Made tests derive skill names and counts from `UPSTREAM.json`, so a future upstream release is not blocked by fixed v7.0.1/84/15 assertions.
- Added raw-parity verification to the workflow, update path, and publish gate.
- Made manifest replacement transactional alongside `skills/`; numeric SemVer comparison now covers `7.0.9` vs `7.0.10`.
- Provider `get()` returns `undefined` for a missing skill file, and catalog discovery skips directories without `SKILL.md`.
- Added rc.5 tool-contract checks, rejected-source and manifest-write failure rollback tests, and a future-version compatibility test.

## [0.1.0] - 2026-10-30

### Added
- Initial release of Superpowers plugin for DeepSeek Harness v0.2.1-rc.3+
- All 15 Superpowers skills from v7.0.1 with DSH-specific adaptations
- Per-session bootstrap injection mechanism
- Upstream sync scripts (`sync-upstream.mjs`, `update-upstream.mjs`)
- Comprehensive test suite (7 tests passing)
- DSH tool mapping (`references/dsh-tools.md`)
- Diagnosing path patching (workspace-local `.superpowers` instead of `~/.superpowers`)

### Changes
- Uses deterministic upstream version pinning (Superpowers 7.0.1)
- Tree hash verification for reproducibility
- Minimal modifications to original Superpowers content
- Zero runtime dependencies besides peer DSH packages

### Security
- No postinstall scripts or build steps
- No network access during installation
- All code reviewed and sanitized
- Transparent third-party attribution in THIRD_PARTY_NOTICES.md

---

## Upcoming Features
- GitHub Actions CI/CD pipeline
- Automated upstream update detection
- Documentation site generation
