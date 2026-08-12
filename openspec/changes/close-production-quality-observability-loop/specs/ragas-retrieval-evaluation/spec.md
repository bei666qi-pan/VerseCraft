## ADDED Requirements

### Requirement: Retrieval datasets use a RAGAS-compatible schema
The offline evaluator SHALL accept cases containing a question, generated answer, retrieved contexts, and ground-truth answer or reference contexts.

#### Scenario: Dataset case is evaluated
- **WHEN** a valid retrieval case is supplied
- **THEN** the report identifies the case, dataset version, retrieval trace reference, contexts and ground-truth provenance without copying private player content

### Requirement: Core RAGAS quality dimensions are reported
The evaluator SHALL report versioned `context_precision`, `context_recall`, `faithfulness`, and `answer_relevancy` dimensions and SHALL distinguish deterministic, model-judged, unavailable, and failed results.

#### Scenario: Live judge credentials are absent
- **WHEN** faithfulness or answer relevancy requires an unavailable model or embedding service
- **THEN** that metric is marked unavailable and the strict live gate does not claim success

### Requirement: RAGAS results join the evaluation loop
RAGAS-compatible results SHALL be written to local JSON and Markdown reports, compared with a baseline, and optionally uploaded as Langfuse scores linked to a trace or dataset run.

#### Scenario: Regression exceeds threshold
- **WHEN** a current metric is below its configured floor or baseline tolerance
- **THEN** the evaluation report fails the retrieval-quality gate and emits a non-mutating repair recommendation
