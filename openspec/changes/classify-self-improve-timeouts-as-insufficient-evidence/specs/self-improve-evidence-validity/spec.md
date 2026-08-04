## ADDED Requirements

### Requirement: Deterministic oracle scoring uses conclusive evidence only
The strict verifier SHALL score invariant expectations only for deterministic case results that contain no execution errors.

#### Scenario: Timed-out cases are excluded from oracle failures
- **WHEN** a deterministic case contains timeout errors and invariant results derived without a usable DM payload
- **THEN** the verifier SHALL NOT count those invariants as expectation mismatches or unresolved gameplay defects

#### Scenario: Conclusive mismatch remains a strict failure
- **WHEN** a deterministic case contains no execution errors and an invariant actual value does not match its expectation
- **THEN** the verifier SHALL count the case as failing and return `STRICT_FAIL`

### Requirement: Unusable cases prevent strict completion
The strict verifier MUST return `INSUFFICIENT_EVIDENCE` with exit code 2 when one or more deterministic cases are unusable due to execution errors.

#### Scenario: Campaign contains timed-out live traces
- **WHEN** required artifacts exist and at least one deterministic case records a live execution timeout
- **THEN** the verifier SHALL report insufficient evidence and SHALL NOT return `STRICT_PASS`

### Requirement: Evaluation contracts remain unchanged
The implementation MUST preserve scenario expectations, strict gate thresholds, and holdout artifacts.

#### Scenario: Applying the evidence-validity fix
- **WHEN** the implementation is reviewed
- **THEN** no expectation, threshold, or holdout file SHALL be modified
