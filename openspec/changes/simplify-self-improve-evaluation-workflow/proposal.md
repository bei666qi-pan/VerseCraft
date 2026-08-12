## Why

The current self-improvement tooling combines useful evaluation evidence with an expensive and weakly proven autonomous code-repair supervisor. VerseCraft needs a smaller, trustworthy evaluation-and-regression workflow in which defects are reported with actionable evidence and code changes remain an explicit developer/Codex task.

## What Changes

- Reposition the offline “self-improving multi-agent system” as an evaluation and regression campaign.
- Preserve scenario execution, deterministic oracles, optional model judges, defect triage, quality gates, holdout checks, reports, and replayable runtime evidence.
- Remove automatic Codex/Claude writer paths in both the evaluation supervisor and local AutoOps incident runner, including unattended commit/push behavior.
- Replace generated repair plans with actionable defect recommendations that do not claim or initiate code modification.
- **BREAKING**: retire the `self-improve:supervise` command and Codex repair-backend options; callers must run the evaluation command and open an explicit implementation task from its report.
- Retain compatibility aliases for the existing `self-improve:*` evaluation commands where inexpensive, while introducing neutral `eval:campaign` naming.
- Keep deployment-layer retry/diagnosis and the bounded online DM tool loop unchanged because neither is part of offline code repair.

## Capabilities

### New Capabilities

- `evaluation-regression-workflow`: Defines the evidence-producing campaign, human/Codex handoff, non-mutating boundary, and compatibility behavior for legacy commands.

### Modified Capabilities

- `intent-grounded-playability-evals`: Clarifies that findings produce evidence and recommendations, not autonomous production-code changes.
- `model-narrative-review-evals`: Clarifies that model-judge output remains advisory evidence subject to deterministic gates and explicit repair handoff.

## Impact

- Affected areas: `scripts/self-improve/*`, `src/lib/evals/selfImprove/*`, mutation-capable local AutoOps writer entry points, package scripts, evaluator documentation, and obsolete local Codex agent configuration dedicated to automatic repair.
- `/api/chat`, SSE/DM JSON, game-state commit, analytics event names/payloads, database schema, authentication, save compatibility, and online latency budgets are unchanged.
- The live evaluator may continue calling `/api/chat`, but this change adds no work to the player-facing request path and requires no feature flag or runtime migration.
- Non-goals: redesigning the evaluation rubrics, weakening quality thresholds, changing the bounded DM Agent tool loop, or changing Coolify deployment retry behavior.
