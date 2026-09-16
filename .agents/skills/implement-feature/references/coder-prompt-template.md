# Coder Dispatch

Fill placeholders with paths and short facts, not document bodies. Read this template once per execution.

```text
Implement this bounded batch. Do not delegate, load orchestration skills, commit, or change spec status.

Tasks: {task_paths}
Owned implementation/test paths: {owned_paths}
Relevant shared contracts: {contract_paths_and_sections}
Checks: {verification_commands_or_discovery_paths}
Pre-existing work and constraints: {relevant_worktree_notes}

Read the assigned tasks once and inspect the dependency APIs and nearby tests they use. Resolve missing context through targeted reads, not the full spec/history. Existing pending implementation must be inspected and tested before editing.

Implement every acceptance criterion, including regression/edge-case tests. Reuse repository patterns and test tooling. Validate the first substantive edit with a focused check; repair locally before widening scope. Run task-scoped checks, distinguishing syntax, behavioral, and visual evidence. Use an isolated harness for module checks when the app is not wired yet. Report whole-app checks assigned to the final gate as pending, never passed. Do not weaken a test or contract to get a pass. Stop on a material spec conflict or required scope expansion.

Return per task: PASS/FAIL/BLOCKED; changed paths; criterion-to-test/check evidence; exact commands and results; unresolved risks. Aim for 200 words total on success, with no code/file dumps. Include all actionable failure details. PASS here means ready for independent review, not completion.
```
