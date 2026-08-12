## ADDED Requirements

### Requirement: Langfuse readiness is executable and explicit
The repository SHALL provide a preflight that reports disabled, misconfigured, ready, export-failed, or healthy state based on feature flags, credentials, endpoint, SDK and an explicit export probe.

#### Scenario: Flag enabled without complete credentials
- **WHEN** Langfuse is enabled but required keys or a non-default production hash salt are missing
- **THEN** preflight fails with named missing configuration and does not expose secret values

#### Scenario: Export probe succeeds
- **WHEN** an authorized integration probe creates a synthetic trace and score and flushes successfully
- **THEN** the result reports the trace ID and healthy export status

### Requirement: Online tracing remains private and fail-open
Online Langfuse instrumentation MUST NOT upload full prompts, player input, narratives, cookies, tokens or secrets and MUST NOT block the first feedback path.

#### Scenario: Langfuse exporter is unavailable
- **WHEN** export initialization or delivery fails during a chat request
- **THEN** `/api/chat` preserves its SSE response and records bounded local export-health evidence

### Requirement: Options-only requests are traceable end to end
Every sampled `options_regen_only` request SHALL create and end a trace with request ID, result status, latency, option count and bounded failure reason codes.

#### Scenario: Options generation is rejected before model execution
- **WHEN** an options-only request fails validation or upstream generation
- **THEN** the trace is ended with failure metadata and the client receives an optional trace/request correlation identifier
