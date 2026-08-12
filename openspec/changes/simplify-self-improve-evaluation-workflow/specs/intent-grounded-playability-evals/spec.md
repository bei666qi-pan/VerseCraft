## ADDED Requirements

### Requirement: Playability findings require explicit repair handoff
Intent-grounded playability evaluation SHALL emit auditable case, invariant, candidate, and verdict evidence for an explicit developer or Codex implementation task. The evaluator SHALL NOT modify production code or tests in response to a finding.

#### Scenario: Deterministic oracle rejects a candidate
- **WHEN** the playability oracle produces a failed verdict
- **THEN** the result SHALL identify the violated case invariant and expected validation, and SHALL remain a recommendation until a separately requested implementation task applies a fix

#### Scenario: Repair is later implemented
- **WHEN** a developer or explicit Codex task changes code for a reported finding
- **THEN** the playability evaluator SHALL be rerun as verification and SHALL NOT infer success merely from the existence of a code diff
