## ADDED Requirements

### Requirement: Product readiness includes rendered canary and retrieval evidence
The evaluation workflow SHALL distinguish automated test success from product readiness and SHALL include the configured production-experience canary and RAGAS-compatible retrieval gate in release evidence.

#### Scenario: Unit and E2E suites pass but live options fail
- **WHEN** code-level tests pass while the browser canary cannot obtain playable action options
- **THEN** the report marks product readiness failed and preserves the browser/SSE evidence

#### Scenario: RAGAS live evidence is unavailable
- **WHEN** retrieval metrics requiring live services cannot be computed
- **THEN** the report marks that portion insufficient or blocked rather than treating mock evidence as a live pass

### Requirement: Quality loops remain non-mutating
The extended canary, RAGAS and Langfuse stages SHALL only collect evidence, compare thresholds and produce explicit recommendations.

#### Scenario: A regression is detected
- **WHEN** any new stage fails its threshold
- **THEN** no stage edits source code, commits, pushes or deploys a repair automatically
