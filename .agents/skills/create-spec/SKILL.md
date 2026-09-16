---
name: create-spec
description: 'Create or update specs/{feature}/ with actionable tasks, dependency waves, acceptance checks, and resumable status. Use for create a spec, plan this feature, continue planning, break this into tasks, or /create-spec.'
---

# Create Spec

Turn agreed requirements into a plan the implementation loop can execute without replaying the planning conversation. Keep decisions and testable contracts, not discussion history.

## Procedure

1. Read the supplied design or existing spec and inspect only relevant code, interfaces, test tooling, and CI. Reuse decisions already made; ask only about material unknowns. For continued planning, update affected sections/tasks without regenerating unchanged files or resetting completion status. Reopen changed acceptance criteria explicitly.
2. Choose `specs/{kebab-case-feature}/`. Capture the complete feature contract once in `requirements.md`: behavior, constraints, shared APIs/invariants, nonfunctional requirements, and feature-level acceptance criteria. Preserve exact values, schemas, and commands where correctness depends on them. Give requirements stable IDs so tasks and final review can trace coverage.
3. Split work into testable concerns, usually 1-5 implementation files with their tests. Avoid tiny tasks for trivial helpers that can share a coding batch. Mark high-risk/shared-interface work explicitly. Include tests with implementation; separate a test task only for genuinely independent integration work.
4. Build dependency waves in topological order. Tasks in the same wave must have disjoint implementation AND test-file ownership. Move conflicting tasks to later waves or combine them. Waves describe dependency readiness, not a requirement to run concurrent agents.
5. Write the files below using these inline formats; no external planning templates are required. Task contracts must be actionable without rereading the design or unrelated tasks. Include only relevant shared requirement references, not copies of the entire requirements document or summaries of every completed task. Workers still inspect actual dependency code.
6. Before finishing, check that every requirement maps to a task and verification, dependencies exist and are acyclic, same-wave ownership is disjoint, and interfaces agree across tasks. Check formulas/examples against each other with a focused executable probe where possible. Do not copy speculative APIs as authoritative contracts.
7. Report the spec path, task/wave counts, blockers, and the command `start implementing specs/{feature}`. Planning does not implement the feature.

## File Formats

### README.md

- Brief feature summary and links to requirements and manual actions.
- Compact cross-task invariants and links to their authoritative sections.
- Verification: actual commands, prerequisites, task vs wave vs final scope, and browser/visual checks where applicable. If commands are unknown, identify the script/config path to inspect. Do not invent lint/typecheck/build commands or treat syntax as runtime coverage.
- A single status table: `ID | Task link | Wave | Dependencies | Owned paths | Status`.
- Status values: `pending`, `implementing`, `blocked`, `complete`. Preserve the existing table/checkbox format when updating a legacy spec. README owns status; do not duplicate it in new task files.
- An `Execution checkpoint` section reserved for current wave/next IDs, concise verification evidence and applicable state, decisions, blockers, and final-gate status. Initially final gate is pending. The executor replaces this section rather than accumulating a log.

### requirements.md

- Requirement IDs, behavior, exact shared contracts, constraints, and feature-level acceptance criteria.
- A compact requirement-to-task/check coverage mapping, including integration and nonfunctional checks. No requirement may disappear just to shorten a prompt.

### tasks/task-{nn}-{name}.md

```text
# Task {nn}: {title}
Wave: {number}
Depends on: {task IDs}
Owns: {implementation and test paths}
Risk: {normal/high and reason}
Requirements: {IDs and specific shared-contract sections}

## Goal
Observable outcome and scope boundaries.

## Contract
Relevant inputs/outputs, dependency paths and public interfaces, exact values,
error behavior, and edge cases. Link shared definitions instead of copying
large documents. Include implementation constraints, not speculative full code.

## Acceptance And Verification
For each criterion: expected behavior, test/check, and execution prerequisites.
Cover normal, boundary, failure, and integration cases as relevant.
Assign each check to its earliest runnable gate: task, wave, or final integration.
Module checks must run without future tasks, using isolated harnesses if needed.
List exact commands when known; otherwise specify how to discover/run the check.
Call out visual/manual checks explicitly; they cannot be replaced by syntax tests.
```

### action-required.md

List human prerequisites by timing (before/during/after), affected tasks/checks, and completion evidence. Never request secrets in chat. If none, state that no manual prerequisites are required.