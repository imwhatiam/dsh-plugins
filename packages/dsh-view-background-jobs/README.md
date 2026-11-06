# dsh-view-background-jobs

A read-only DeepSeek Harness panel that lists every running background job with
its owning workspace and session.

## What it shows

- The `sidebar.panellist` entry **Background jobs**, directly below
  **Automation tasks** (`order: 20`).
- A page grouped by workspace. Each row shows the job command, status
  (`running` / `stopping`), owning session, start time, and elapsed duration.
- Session names open that session; nothing on the page stops, deletes, or
  expands a job.
- Live updates through the existing `ctx.jobs` roster streams.

## Install

This package is local-only. From a Harness session with the `plugin_manager` tool:

```text
plugin_manager action=install_bundle target=<absolute path to packages/dsh-view-background-jobs>
```

The bundle inserts one row into the active profile:

```yaml
- insert:
    - id: background-jobs
      name: 'dsh-view-background-jobs'
```

## Scope

- Written against DeepSeek Harness 0.2.2-rc.1.
- Client-only: no Host API, no session-log writes, no persisted state.
- Only live jobs (`running` / `stopping`) are listed. The job registry cancels
  live work when its owner is disposed, so a running job always has a live
  owner.
- Jobs whose session is missing from the session snapshot are shown by their
  short session id; jobs without an owner appear under **Unassigned**.

## Verify

1. `node --check client.js`
2. `node --test test/*.test.cjs`
3. Install, then confirm the `sidebar.panellist` and `main` occupants with
   `cordis_inspect_query` (`Slots.listSubTree`).
4. Open the panel, start a `sleep 300` background job in a session, and confirm
   the row appears with the right workspace and session. Kill it and confirm the
   row disappears.
