## ADDED Requirements

### Requirement: Production canary validates business outcomes
The system SHALL provide a browser canary that validates the real opening-to-options user path on a local production preview and a configured deployed URL.

#### Scenario: Opening options succeed
- **WHEN** the canary creates a local character, opens `/play`, and expands action options
- **THEN** it observes between two and four enabled model-generated action choices within the configured deadline

#### Scenario: HTTP succeeds but options fail
- **WHEN** `/api/chat` returns HTTP 200 and a parseable SSE body but no playable options
- **THEN** the canary fails product readiness and records the request ID and visible failure state

### Requirement: Brand positions render a single mark
Each branded header position SHALL render exactly one VerseCraft brand mark and SHALL NOT render a second decorative brand mark adjacent to the wordmark.

#### Scenario: Mobile play header is inspected
- **WHEN** `/play` is rendered at 390×844, 393×852, or 430×932
- **THEN** the header brand container contains exactly one element identified as the VerseCraft brand mark and no duplicate brand overlay

### Requirement: Canary collects rendered evidence
The canary MUST record URL, title, nonblank DOM, framework overlay status, console errors, screenshots, and the outcome of the required interaction.

#### Scenario: Release evidence is produced
- **WHEN** the canary completes
- **THEN** its artifact distinguishes contract availability, rendered integrity, and business-path readiness
