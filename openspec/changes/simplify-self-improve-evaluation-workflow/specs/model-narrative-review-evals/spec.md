## ADDED Requirements

### Requirement: Model review remains advisory to explicit repair work
Model narrative review SHALL provide provenance-labelled evidence and recommendations to the evaluation report. A model judge verdict SHALL NOT directly trigger repository mutation, and supported critical or major findings SHALL still fail the configured strict live gate.

#### Scenario: Model judge reports a major issue
- **WHEN** a live model review returns a supported major issue with the required excerpt and scope evidence
- **THEN** the report SHALL fail the applicable gate and recommend an explicit implementation task without launching a code writer

#### Scenario: Judge evidence is inconclusive
- **WHEN** a model verdict lacks confidence, agreement, or required evidence
- **THEN** the report SHALL classify it as inconclusive and SHALL NOT treat it as either a passing review or authorization to change code
