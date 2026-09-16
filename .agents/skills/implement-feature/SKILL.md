---
name: implement-feature
description: 'Execute a specs/{feature}/ plan autonomously through completion with bounded coder batches, independent wave reviews, and verified checkpoints. Use for start implementing, continue implementing, run the spec, execute the plan, or /implement-feature.'
---

# Implement Feature

Coordinate implementation until every task and final integration gate passes, or a genuine blocker prevents progress. Do not stop for routine approval between batches or waves. The coordinator tracks progress; coder agents implement and a separate reviewer checks their work. At most one subagent is active.

## Load Once

1. Read the spec README: status, waves, dependencies, cross-task invariants, and verification commands. Read applicable prerequisites in `action-required.md`, if present. Check repository instructions, available agents/tools, test scripts/CI, and dirty-worktree paths once.
2. Accept checkbox status (`[x]` complete, `[ ]` pending) or a status table (`Done`/`complete`, `Implementing`, `Blocked`, `Not started`/`pending`), ignoring decorative symbols. Preserve the existing format. README status is authoritative; reconcile conflicting task notes with evidence before proceeding.
3. Select the earliest incomplete wave. Inspect only pending task metadata needed for dependencies, ownership, risk, and checks. Do not load all task bodies, all completed tasks, or the full requirements by default. Read a specific requirement section only to resolve a missing contract.
4. Load [coder](./references/coder-prompt-template.md) and [review](./references/review-prompt-template.md) templates once when first needed; load [fix](./references/fix-prompt-template.md) only on failure. Use the actual subagent API. If a named coder/reviewer is unavailable, use the default writable agent with the appropriate role; never use a read-only explorer to implement.
5. If the checkpoint is absent, initialize it from actual status and inspected work, with final gate pending; never reset completed tasks. Scope checks to task, wave, or final gates. Check module behavior now using an isolated harness if the app is not wired yet; whole-app workflows run at the final gate. Do not silently defer a task's acceptance criteria or substitute syntax for behavior.

## Repeat For Each Wave

### Implement

- Select dependency-ready tasks. Batch 1-3 small tasks with at most 5 implementation files total; use a singleton for large, high-risk, or tightly coupled work. Respect wave dependencies; serialize overlapping ownership. Never run conflicting writers concurrently.
- Dispatch paths, scope, relevant invariant references, and checks, not pasted requirements, source code, or summaries of every completed task. Workers read assigned task bodies and actual dependency APIs. They do not reload orchestration skills or delegate further.
- If a pending task already has implementation, have the worker inspect and test it before changing it. Do not overwrite work or infer completion from file existence. Without a writable subagent capability, report the blocker rather than pretending delegation succeeded.
- Collect per-task results: changed paths, acceptance evidence, commands/results, unresolved risks. Keep normal reports under 200 words; never truncate failures or evidence needed to assess them. After each batch, save concise evidence and ready-for-review IDs in the README checkpoint so resume need not repeat verified implementation; keep full logs outside chat.
- Continue with the next ready batch. A worker's success means ready for review, not complete. Failed work stays incomplete; do not dispatch its dependents. Repair local failures or surface a blocker.

### Review And Repair

1. Dispatch one independent, read-only reviewer for the wave after its batches finish. Supply task paths, changed-file scope, concise evidence, known pre-existing changes, and verification commands. Include resumed work not yet reviewed; inspect current files even if untracked or committed earlier.
2. The reviewer reads task acceptance criteria, relevant requirement sections, and current code; checks contracts, edge cases, security, scope, and test adequacy. It runs applicable wave integration checks and required gates. Reuse successful focused-test evidence only when the relevant code, dependencies, tests, and environment have not changed; otherwise rerun. Neither worker claims nor syntax alone establish PASS.
3. On FAIL, group concrete findings into bounded fixes using the fix template. Rerun failed checks and affected regressions, then request independent re-review of the fixes and impacted interfaces. Do not re-review unchanged unrelated code.
4. Allow at most three review/fix cycles. On persistent failure or an unavailable required check, record Blocked with evidence and stop. Never mark incomplete or unverified work Done or advance its dependents to bypass a gate.

### Checkpoint And Continue

- Only after review PASS, mark reviewed tasks complete in the README and update task status fields if they exist. Do not introduce a second status system in legacy specs.
- Maintain one compact `Execution checkpoint` section: current wave/next task IDs, reviewed paths, commands/results and the revision or working-tree state they apply to, relevant decisions, blockers, final-gate status. Replace stale entries; do not append a transcript. Task status retains historical completion.
- Report one short wave summary, then continue automatically. Commit only if explicitly authorized, staging only task-owned paths after inspecting the diff; otherwise leave changes uncommitted.
- Across compaction or resumption, reload the checkpoint and pending metadata, not the whole history. Revalidate evidence if its state cannot be established.

## Final Gate

After all tasks pass, dispatch an independent final integration reviewer to run the full applicable repository and feature end-to-end checks, including browser/visual checks for rendering. Supply the requirements path so it can verify the whole feature contract. Focus review on cross-wave integration, not another line-by-line review of already reviewed modules. The reviewer owns these checks; the coordinator does not duplicate them. Reuse the last wave's reviewer invocation if it covers both scopes explicitly.

Fix findings and rerun affected checks under the same bounded repair policy. Record final PASS only with evidence; missing tooling or credentials means Blocked/unverified, not completion. On resume with all tasks Done, run any missing or stale final gate. Report completed tasks, verification, outstanding limitations, and commit status concisely.