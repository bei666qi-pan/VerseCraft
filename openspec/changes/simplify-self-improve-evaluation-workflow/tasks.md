## 1. Supported Evaluation Workflow

- [x] 1.1 Add neutral `eval:*` package commands and keep only non-mutating legacy aliases.
- [x] 1.2 Update campaign CLI and reports to describe evaluation, recommendations, and explicit repair handoff.
- [x] 1.3 Update evaluator types/orchestration so repair-plan output is recommendation-only and never claims applied repairs.

## 2. Retire Autonomous Code Repair

- [x] 2.1 Remove the Codex-writing supervisor and its package entry point.
- [x] 2.2 Remove repair-specific daemon/watchdog/dashboard utilities and automatic-repair Codex role configuration with no remaining consumer.
- [x] 2.3 Remove the local AutoOps generative writer/commit/push path while retaining health polling and deterministic remediation.
- [x] 2.4 Verify repository references no longer advertise or invoke an automatic repair backend.

## 3. Documentation and Compatibility

- [x] 3.1 Rewrite the evaluator README around evidence collection, strict gates, reports, and explicit implementation handoff.
- [x] 3.2 Document the breaking command migration and distinguish offline evaluation from the bounded DM tool loop and deployment retry.
- [x] 3.3 Preserve existing runtime evidence files without migration or deletion.

## 4. Verification

- [x] 4.1 Add or update focused unit tests for recommendation-only behavior and supported command boundaries.
- [x] 4.2 Run focused evaluator tests and OpenSpec validation.
- [x] 4.3 Run `pnpm lint` and `git diff --check`, reporting any pre-existing or environment failures separately.
