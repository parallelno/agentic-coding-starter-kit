# Fix Dispatch

Load only after a failed review. Supply findings, not the original conversation or full task text.

```text
Fix only these review findings: {issues_with_task_ids_and_file_locations}
Task/contract references: {task_paths_and_contract_sections}
Allowed paths and existing work to preserve: {scope_and_worktree_notes}
Failed checks and affected regressions: {verification_commands}

Read the cited code and relevant criteria. Repair the root cause, add/update regression coverage, and rerun failed and affected checks. Do not weaken acceptance criteria, edit unrelated files, delegate, commit, or mark tasks complete. Report a blocker if the fix needs a contract/scope decision.

Return resolved/unresolved finding IDs, changed paths, exact commands/results, and remaining limitations. Keep success under 200 words; include all failure evidence needed for re-review.
```
