# Model Narrative Review Evals

## Purpose

Provide auditable real-model evidence for narrative hallucination resistance and playability without presenting mock or heuristic coverage as player-facing quality proof.

## Requirements

### Requirement: Live model review has explicit evidence provenance
The evaluation system SHALL classify every narrative-review result as `live_model`, `offline_heuristic`, `inconclusive`, or `not_run`. Only a successfully parsed response from the configured `EVAL_JUDGE` gateway that meets the review evidence requirements SHALL be classified as `live_model`. A gateway failure, budget exhaustion, timeout, invalid JSON, missing required issue evidence, low confidence, or unresolved judge disagreement SHALL NOT be reported as a passing live review.

#### Scenario: Gateway result is unavailable
- **WHEN** a live model review request cannot obtain a valid gateway response
- **THEN** the case result SHALL be `inconclusive` with a machine-readable reason and SHALL NOT increment live pass coverage

#### Scenario: Offline regression review runs
- **WHEN** a mock or deterministic review executes without a live gateway call
- **THEN** its result SHALL be labelled `offline_heuristic` and SHALL NOT be presented as evidence of real-model narrative quality

### Requirement: Review targets are auditable and scope-bound
The evaluation system SHALL build each model-review target from the completed authoritative DM result, player-visible narrative/options, relevant structured before/after state, player actions, and only scenario-scoped facts permitted by reveal and actor scope. Every critical or major reported issue SHALL include a step identifier and player-visible excerpt; unsupported claims SHALL be marked inconclusive rather than accepted as findings.

#### Scenario: Model reports a fact hallucination
- **WHEN** a model review identifies a critical or major hallucination
- **THEN** the result SHALL cite the affected transcript step and visible excerpt alongside the permitted/contradicted fact reference

#### Scenario: Hidden fact is outside the review scope
- **WHEN** a fact is not permitted by the target's reveal or actor scope
- **THEN** the review prompt and result context SHALL exclude it and the system SHALL not use it to judge the player-visible narrative

### Requirement: Model review evaluates playable narrative quality
The system SHALL evaluate factual support, epistemic boundaries, state-to-narrative consistency, option executability, player agency, and readable suspense with a versioned structured rubric. The model SHALL return structured scores, severity-tagged issues, and supporting evidence; a case with supported critical or major defects SHALL be visible in the report and fail strict live gating.

#### Scenario: Generated option cannot be executed
- **WHEN** the narrative presents an option that contradicts the authoritative state or available scene affordances
- **THEN** the review SHALL report an option-executability issue with its evidence

#### Scenario: Player agency is absent
- **WHEN** a completed trajectory repeatedly advances the story without a meaningful player decision or consequence
- **THEN** the review SHALL report the agency concern or mark the evidence insufficient, rather than silently passing the trajectory

### Requirement: Live review is opt-in, bounded, and isolated from gameplay
Live model review SHALL run only when explicitly requested by CLI live mode and `VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS` is enabled. It SHALL use the existing AI logical task/gateway, the evaluation budget guard, bounded timeouts, and content-hash caching. It SHALL execute after the completed SSE final result in the evaluation process and SHALL NOT alter `/api/chat` SSE frames, DM JSON, player state, analytics events, or chat latency budgets.

#### Scenario: Feature flag is disabled
- **WHEN** a caller requests model review but the feature flag is disabled
- **THEN** no live model request SHALL be sent and the output SHALL be `not_run` with a disabled reason

#### Scenario: Live review executes after a turn
- **WHEN** a live evaluation receives a completed `__VERSECRAFT_FINAL__` DM result
- **THEN** it SHALL review that completed result outside the online chat request path

### Requirement: Reports disclose confidence and coverage honestly
Every model-review report SHALL identify its rubric version, logical task/model identity when available, content/case hash, cache status, evidence provenance, live coverage, pass/fail/inconclusive counts, and issue evidence. A strict live gate SHALL fail when configured minimum live coverage is not met or when supported critical/major defects are found. Mock and deterministic reports SHALL identify their evidence class and SHALL NOT claim that the real model's playability has been validated.

#### Scenario: Incomplete live sample
- **WHEN** only part of the requested cases receive valid live model verdicts
- **THEN** the report SHALL show the live coverage ratio and each inconclusive reason, and strict coverage assertion SHALL fail when the configured minimum is unmet

#### Scenario: Mock regression report
- **WHEN** a mock quality evaluation completes successfully
- **THEN** the report SHALL describe it as deterministic or mock regression coverage and SHALL not use its pass rate as a live quality score

### Requirement: Model review remains advisory to explicit repair work
Model narrative review SHALL provide provenance-labelled evidence and recommendations to the evaluation report. A model judge verdict SHALL NOT directly trigger repository mutation, and supported critical or major findings SHALL still fail the configured strict live gate.

#### Scenario: Model judge reports a major issue
- **WHEN** a live model review returns a supported major issue with the required excerpt and scope evidence
- **THEN** the report SHALL fail the applicable gate and recommend an explicit implementation task without launching a code writer

#### Scenario: Judge evidence is inconclusive
- **WHEN** a model verdict lacks confidence, agreement, or required evidence
- **THEN** the report SHALL classify it as inconclusive and SHALL NOT treat it as either a passing review or authorization to change code
