## Context

VerseCraft currently has a useful offline evaluation harness and a separate supervisor that launches `codex exec` with repository write access after a strict-gate failure. The evaluator itself already behaves as a staged workflow: execute cases, apply deterministic checks, optionally collect model-judge evidence, triage findings, run gates, execute holdout cases, and report. Automatic code editing is bolted on outside that workflow and has not demonstrated reliable convergence in recorded campaigns.

The repository also uses “agent”, “repair”, and “self-healing” for unrelated features. This change is limited to unattended code-repair automation, including the local AutoOps issue writer that can commit and push changes. The bounded online DM tool loop, health monitoring, deterministic remediation, and deployment retry/diagnosis retain their existing behavior.

## Goals / Non-Goals

**Goals:**

- Make the offline campaign a read-only evaluator of tracked source and tests.
- Produce actionable, evidence-linked defect recommendations for an explicit implementation handoff.
- Remove the supervisor and configuration whose purpose is to let an evaluator invoke an autonomous code writer.
- Remove the local AutoOps path that turns incident issues into unattended agent edits, commits, and pushes.
- Give the supported workflow neutral `eval:*` commands while retaining inexpensive aliases for legacy evaluation commands.
- Preserve strict gates, evidence provenance, holdout isolation, and live/mock distinctions.

**Non-Goals:**

- Weakening rubrics, assertions, stop thresholds, or holdout checks.
- Changing `/api/chat`, SSE, DM JSON, state commit, prompts, schema, analytics, or player-facing behavior.
- Removing bounded online tool use or Coolify transient deployment retries.
- Moving every existing evaluator file solely to eliminate the historical `selfImprove` directory name.

## Decisions

### 1. Staged evaluation replaces autonomous repair orchestration

The supported flow is `evaluate -> triage -> recommend -> gate -> report`. The report is the boundary: a developer or an explicitly requested Codex implementation task consumes it later. The evaluator MUST NOT spawn a code-writing process or edit tracked files.

Alternative considered: retain the supervisor behind an opt-in flag. Rejected because dormant mutation-capable infrastructure still carries maintenance, safety, and product-understanding cost, while an explicit Codex task provides better context and reviewability.

### 2. Keep the evidence engine, remove the writer layer

Scenario pools, deterministic invariants, optional judges, clustering/triage, quality gates, stop policy, holdout execution, traces, and reports remain. Static repair plans are converted to recommendations and must not be described as applied repairs. Round reports use recommendation counts and keep `defectsRepaired` at zero only where needed for historical artifact compatibility.

Alternative considered: delete the entire `src/lib/evals/selfImprove` tree. Rejected because most of that tree is the valuable evaluation product, not the autonomous writer.

### 3. Introduce neutral commands with narrow compatibility aliases

`eval:campaign`, `eval:baseline`, `eval:report`, and `eval:verify:strict` become the documented commands. Existing `self-improve:run`, `self-improve:baseline`, `self-improve:report`, and `self-improve:verify:strict` remain aliases for one compatibility window. Mutation-capable `self-improve:supervise` and its repair-backend/daemon wrappers are removed rather than aliased.

### 4. Remove only offline repair-specific agent configuration

Codex role files created specifically for the autonomous repair campaign are removed if they have no other consumer. General project Codex/OpenSpec configuration is retained.

### 5. Preserve runtime and production contracts

No production request handler imports the removed supervisor. Existing `.runtime-data` results remain readable files and are not migrated or deleted. No database migration, analytics migration, feature flag, or rollout gate is required.

### 6. Keep deterministic operations automation, remove generative code mutation

AutoOps continues to poll health, collect diagnostics, restart Coolify, and perform bounded deployment retries. Its local agent issue runner and repair backend are removed because they cross the same explicit-implementation boundary as the evaluation supervisor.

## Risks / Trade-offs

- [Legacy automation invokes removed supervisor commands] → Fail clearly at command discovery instead of silently editing code; document the replacement `eval:campaign` plus explicit repair handoff.
- [Historical names remain in internal paths] → Accept limited naming debt to avoid a broad mechanical move that could destabilize imports and tests.
- [Reports may appear less “automatic”] → Add explicit next-action recommendations and evidence locations so implementation handoff is faster and more trustworthy.
- [Removing daemon files can break private local launchers] → Remove package-visible entry points and document the breaking change; do not touch unrelated deployment automation.

## Migration Plan

1. Add neutral evaluation commands and documentation.
2. Change evaluator terminology and output from repairs to recommendations without weakening gates.
3. Remove the Codex-writing supervisor, daemon wrappers, local AutoOps writer, and repair-only agent roles.
4. Run focused evaluator tests, OpenSpec validation, lint, and diff checks.

Rollback is a normal source revert; no persistent product data or database state changes.

## Open Questions

None required for implementation. A later change may rename the internal `selfImprove` directory after downstream import usage has aged out, but that is deliberately outside this scope.
