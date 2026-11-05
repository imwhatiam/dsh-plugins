# DSH workspace path policy

The upstream skills are kept byte-for-byte unchanged. In DeepSeek Harness, apply these overrides at runtime:

- When a skill or one of its templates says `~/.superpowers/...`, write the artifact under `.superpowers/...` in the current workspace instead.
- For `diagnosing-superpowers`, use `.superpowers/diagnosing-superpowers/<session-id>/` as the case/report directory.
- Keep the DSH workspace-write boundary: do not write outside the current workspace without explicit human approval.
- The upstream files remain the source of truth for wording and workflow; this policy only changes the storage location on DSH.
