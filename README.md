# Agentic Coding Starter Kit

## Model

- DeepSeek-v4.1-Flash
- Implementation time: 2h 45m

Skills for planning features and executing their specs autonomously, with
bounded coding batches and independent quality gates.

## Pipeline

1. Design: write a design document, for example [design/game.md](design/game.md).
2. Plan: `plan this feature design/<feature>.md` or
   `continue planning this feature design/<feature>.md`.
3. Implement: `start implementing specs/<feature>` or
   `continue implementing specs/<feature>`.

The implementation command continues through all waves and final integration,
stopping only when complete or genuinely blocked. No per-task prompting is needed.

## Activation

The workspace rules and skills currently retain their intentionally disabled
names: [_AGENTS.md](_AGENTS.md) and [_.agents/skills](_.agents/skills).
Restore the names `AGENTS.md` and `.agents/` to enable automatic discovery.
The optimization does not reactivate them or change VS Code's built-in prompts.

## Lower-Prefill Loop

- The coordinator reads status and task metadata, then dispatches paths and
  bounded scope instead of copying full requirements and completion history.
- One coder handles 1-3 small ready tasks, at most 5 implementation files;
  large or high-risk tasks stay separate. Only one subagent runs at a time.
- Workers read relevant contracts and code, test their changes, and return
  concise acceptance evidence. They do not start nested orchestration loops.
- One independent reviewer gates each wave. Failed checks trigger targeted
  repairs and re-review, capped at three cycles; unresolved failures block progress.
- Module checks run at task/wave gates, with isolated harnesses if needed.
  Whole-app behavior and visual workflows are checked at final integration.
- The spec README holds status and one replaceable execution checkpoint.
  Existing status tables and checkboxes work without rewriting old specs.

Tests, security/edge-case review, and final integration remain required where
applicable. Unavailable required checks are reported as unverified, not passed.
Commits require explicit authorization; otherwise changes remain uncommitted.

## Measuring Impact

Compare the same task set from equivalent repository states with the same model,
tools, and cache configuration. Measure total wall time, model request count,
uncached prompt tokens, and verification outcomes, not just decode speed.
Keep cold-cache and warm-cache comparisons separate.

These changes target repeated context and unnecessary agent turns. A checkpoint
helps resumption after compaction; it does not itself remove earlier messages
from the live chat or shrink VS Code's tool schemas. Actual latency improvement
requires a new ninfer run; shorter instruction text alone is not a speedup result.