# DeepSeek Harness (DSH) Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On DeepSeek Harness these resolve to the tools below.

| Action skills request | DSH equivalent |
| --- | --- |
| Invoke a skill | `skill` with the exact kebab-case name |
| Read files | `read` |
| Create or overwrite files | `write` |
| Targeted file edits | `edit`; `apply_patch` when the profile enables it |
| Search file contents | `grep` |
| Find files by name or pattern | `glob` |
| Run a shell command | `bash` |
| Run a long-lived server or process | `bash` with `run_in_background: true`, then `job_output`; stop it with `job_kill` |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `subagent` with a self-contained `prompt` |
| Continue a delegated child | `send_message` with its `agent_id` |
| Inspect delegated children | `list_agents` |
| Stop a delegated child | `interrupt_agent` |
| Create or update todos | `todo_write` with the complete list |
| Fetch a URL | `web_fetch` |
| Search the web | `web_search` |
| Ask the human a question | `ask_user_question` |
| Deliver a file | `present` |

## Subagents

DSH's `subagent` starts an independently managed child and returns its id immediately; the runtime notifies the parent when it finishes. The child reports with `send_message`; the parent continues it with `send_message` and inspects it with `list_agents`. Use `subagent_fork` only when the child should inherit the current conversation, and only if it is visible: it is a second instance of the same subagent plugin, not a variant of `subagent`, so a composition that mounts one need not mount the other. A fresh isolated child is the default for implementers, reviewers, and analysts. Never invent a `Task` or `wait_agent` call: use `subagent`, `send_message`, and `list_agents`.

When a child needs a non-default route, call `list_subagent_models` first to see the allowed provider/model pairs and reasoning efforts; omit the route arguments to inherit the parent or default route.

When a child is running and the parent still has local work, keep working instead of waiting. When the parent is genuinely idle with children outstanding, inspect `list_agents` and continue children with `send_message` as needed.

When delegating a task that may use Superpowers paths, include the DSH path policy in the child prompt: use `.superpowers/` in the current workspace, not `~/.superpowers`, and do not write outside the workspace without explicit human approval. Do not repeat the full `using-superpowers` body for a child agent; pass only the necessary adapter instruction.

## Workflows

For a large fan-out of independent units, the `workflow` tool runs a JavaScript orchestration script across subagents. It takes `script` and `meta`; the script has no filesystem, network, timer, or Node.js APIs, so the subagents do the work. Use `subagent` for one delegation and `workflow` when many independent units need the same pipeline.

## Task lists

`todo_write` replaces the complete list on every call. Send every item, not just the changed one.

## Background processes

Use the `bash` tool with `run_in_background: true` for servers and long-lived processes. Read output with `job_output`, list jobs with `job_list`, and stop one with `job_kill`. Do not leave detached processes running after the work is done.

## Browser and visual companion

DSH exposes Chrome DevTools tools when the deployment mounts them, but the visual companion's own server is independent: start it with `bash scripts/start-server.sh ... --foreground` through `bash` (`run_in_background: true`), read `$STATE_DIR/server-info` for the URL, and open that URL in the user's browser. Keep the session key in the URL.

## Session history and diagnosis

Session history tools are optional. They come from `@deepseek-ai/dsh-tool-session-query`, which the `dsh-experimental-session-search` bundle mounts; a profile without that bundle has none of them. When they are visible, they are `session_search`, `session_event_search`, `session_trace`, `session_event_trace`, and `session_event_read`. Do not call them on the assumption that they exist: if they are missing, inspect the persisted log with filesystem and shell tools instead. On disk, a session lives at:

```text
$DSH_HOME/sessions/<encoded-workspace>/<session-id>/session.v4.jsonl.zstd
```

Read it without modifying it:

```bash
zstd -dc <file> | nl -ba
```

Each line is one JSON event. The session header carries the session id, workspace, timestamps, and `parentSession`; subagent sessions are separate directories and can be located through `session_trace`. Compaction is recorded by `compaction/start` and `compaction/end`; a compacted checkpoint is a user message whose `source.kind` is `compact-checkpoint`.

For `diagnosing-superpowers`, write case and report artifacts under `.superpowers/diagnosing-superpowers/<session-id>/` in the current workspace, not under `~/.superpowers`. Keep the session files read-only.

## Diagnostics artifacts and workspace policy

DSH's default file policy is workspace-write. Prefer workspace-local paths for artifacts that are not part of the product. Add `.superpowers/` to `.gitignore` when a skill creates it. Do not write outside the workspace without explicit human approval.

## Graphviz

`writing-skills` can render `dot` diagrams with `node ./render-graphs.js`. This is optional; if `dot` is not installed, skip the rendering and report that Graphviz is unavailable.

## Tool availability

Use only the tools actually visible to the current agent. If the current DSH profile or agent lacks a mapped tool, do not call it; use an available alternative or tell the human what capability is unavailable. The mapping names the intended DSH tool, not a guarantee that every profile mounts it.

Several mapped tools come from separate DSH plugins that a profile or agent preset can drop: `job_list`, `job_output`, and `job_kill` need the jobs plugin, `subagent`, `subagent_fork`, `send_message`, `list_agents`, and `interrupt_agent` need the subagent plugins, and `web_fetch` and `web_search` need the web plugin. When one is missing, run the command in the foreground, do the work yourself, or tell the human what the profile does not provide. Do not claim a background job or a delegated child exists when the tool that reports on it is not mounted.

`apply_patch` is off in the shipped 0.2.2-rc.1 defaults and appears only when a profile sets `applyPatch: true`. `workflow` comes from the base bundle. `list_subagent_models` appears when the preset enables subagent model discovery, as the shipped Web presets do.
