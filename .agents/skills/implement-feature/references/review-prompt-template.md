# Review Dispatch

Fill placeholders with paths, commands, and concise evidence. Read this template once per execution.

```text
Independently review {review_scope}: a wave, targeted repairs, or final feature integration. Do not edit, commit, or delegate.

Tasks and requirements to inspect: {task_paths_and_contract_sections}
Implementation/test paths: {changed_paths}
Worker evidence and its applicable state: {verification_evidence}
Checks to run: {verification_commands}
Pre-existing changes, prior findings, and limitations: {review_notes}

Read acceptance criteria and inspect current implementation/tests, including untracked files. Do not trust completion claims or rely on git diff alone. Check cross-module contracts, edge cases, security, scope, and test adequacy. For final integration, cover feature-level requirements and cross-wave workflows.

Run integration checks and required gates. Reuse focused-test evidence only if relevant code, dependencies, tests, and environment are unchanged; rerun uncertain or impacted checks. Syntax does not prove behavior, and unavailable required checks block PASS. For repairs, verify every finding and affected regression without re-reviewing unrelated code.

Return PASS, FAIL, or BLOCKED with commands/results and acceptance coverage. On failure, give task ID, file:line, severity, expected vs actual behavior, and the required check/fix. Mention unverified criteria explicitly. Keep success concise; include all actionable findings.
```
