# Working Rules

- Keep responses and tool output concise; report decisions, blockers, and verification.
- Ask only about unresolved requirements, risky actions, or genuine blockers. Reuse established decisions.
- For spec planning/execution, load the matching skill once. Follow its autonomous loop through completion; do not pause after each task or wave.
- At most one subagent may be active. Delegate spec implementation and independent review as the execution skill directs; do routine reads, commands, and bookkeeping directly.
- Read only the current task and relevant dependencies. Batch independent reads; do not reread unchanged files or paste documents into dispatch prompts.
- Prefer a focused test over repeated speculation. Preserve acceptance criteria; do not weaken tests to make an implementation pass.
- Run applicable behavior checks and repository-required gates. Syntax checks alone do not prove runtime or visual behavior. Report unavailable checks as unverified, never passed.
- Preserve unrelated work. Do not stage broadly, commit, initialize Git, or change branches unless requested.
- Reuse existing test locations; otherwise use `tests/` for durable tests and `temp/` for scratch files.
- Ignore `opencode.json`.