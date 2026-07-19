## ADDED Requirements

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

### Requirement: EVAL_JUDGE transport preserves strict verdict semantics
The evaluation system SHALL request `EVAL_JUDGE` through a gateway-compatible strict JSON transport that disables optional reasoning output and conservatively extracts a complete JSON object from optional reasoning/prose wrappers before applying the existing strict verdict parser. This transport SHALL NOT convert an invalid, incomplete, low-confidence, or evidence-free response into a passing result, and it SHALL NOT change the offline judge task's timeout, retry, or fallback role policy.

#### Scenario: Gateway wraps a valid verdict in thinking text
- **WHEN** the configured judge gateway returns a complete verdict JSON surrounded by a removable thinking or prose wrapper
- **THEN** the evaluator SHALL parse the verdict and classify it according to the normal evidence and confidence rules

#### Scenario: Gateway response is not a complete verdict
- **WHEN** wrapper removal still does not produce a valid verdict JSON
- **THEN** the evaluator SHALL classify the case as `inconclusive` and SHALL not increment live pass coverage

### Requirement: Playthrough review traces preserve authoritative initial state

Every newly written playthrough trace SHALL include the authoritative state before its first player action. Model-review target assembly SHALL use that state as step zero when present and SHALL NOT substitute the first post-turn snapshot for it.

#### Scenario: First turn repairs a damaged weapon

- **WHEN** a trace starts with a weapon at low stability and its first DM turn repairs it
- **THEN** the review target SHALL contain the low-stability initial state and the post-turn state, so the judge can assess the actual state transition

### Requirement: Review targets distinguish real client-regenerated options from missing choices

When a live trace records a completed client-equivalent `options_regen_only` request, the evaluation system SHALL use regenerated choices as player-visible options only when the request reached a parseable final result, passed the same normalization and semantic-quality gates, and produced two to four applied real-model options. The target SHALL identify this source and whether the result completed the four-choice target. It SHALL NOT synthesize choices or treat a failed response with fewer than two accepted choices as playable.

#### Scenario: Empty main DM options are recovered by a real options-only response

- **WHEN** a trace step has empty main DM options and its recorded options-only response is applied with two to four accepted choices
- **THEN** the model-review target SHALL present those real choices as client-regenerated player-visible options and preserve the completion marker

#### Scenario: Options-only response cannot be applied

- **WHEN** a trace step has empty main DM options and the recorded options-only response failed transport, parsing, semantic quality, or the two-choice minimum requirement
- **THEN** the model-review target SHALL retain no regenerated choices and SHALL expose the failed regeneration evidence for review
