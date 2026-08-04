## ADDED Requirements

### Requirement: Local browser playthrough startup
The browser playthrough driver SHALL create a fresh local character through the visible `/intro → /create → /play` flow without pre-seeding IndexedDB or mocking the chat route.

#### Scenario: Fresh local character enters play
- **WHEN** a driver starts a local browser playthrough on a clean Playwright context
- **THEN** it SHALL select the playable intro world, complete the visible quick-create path, and wait until `/play` exposes the manual action input.

### Requirement: Pluggable player-visible action decisions
The driver SHALL obtain each action from a decision provider whose input contains only player-visible observation data and whose output contains a natural-language action, a short intent, and optional stop signal.

#### Scenario: Deterministic multi-turn campaign
- **WHEN** a caller supplies a sequence decision provider with two actions
- **THEN** the driver SHALL submit the actions in order through the visible manual input without calling a player model.

#### Scenario: External Codex decision compatibility
- **WHEN** an external Codex playtest supplies a compatible decision provider
- **THEN** the driver SHALL use its returned action without requiring changes to the browser driver or `/api/chat`.

### Requirement: Codex file handoff decisions
The driver SHALL support a run-scoped file handoff decision provider that atomically writes a player-visible request and accepts only a decision whose protocol version, run identifier, turn index, and ticket match that request. The request MUST NOT expose Zustand state, IndexedDB, prompt content, or `/api/chat` internal packets.

#### Scenario: Codex supplies the next visible action
- **WHEN** the driver reaches a turn using the Codex file handoff provider
- **THEN** it SHALL write the current player-visible observation request and submit the matching Codex decision through the visible manual input.

#### Scenario: Stale decision is present
- **WHEN** a decision file belongs to another run, turn, protocol version, or ticket
- **THEN** the driver SHALL ignore it and SHALL NOT submit its action.

#### Scenario: Codex does not respond
- **WHEN** no valid matching decision arrives before the configured handoff timeout
- **THEN** the driver SHALL terminate the run with failure evidence and SHALL NOT submit a fallback action.

### Requirement: Distinct developer and blind-player Codex modes
The Codex playtest workflow SHALL expose a developer mode and a blind-player mode. Developer mode SHALL identify its mode in the handoff request and permit the current project Codex to investigate product boundaries. Blind-player mode SHALL create a fresh projectless Codex task for every campaign and provide it only that campaign's player-visible `observation` JSON messages; it MUST NOT provide that task a repository, request/decision path, SSE final, trace, store, prompt, or debugging output.

#### Scenario: Developer mode starts a boundary campaign
- **WHEN** a user starts a developer-mode Codex playtest
- **THEN** the handoff request SHALL identify developer mode and the Codex player instructions SHALL invite adversarial but in-world boundary exploration.

#### Scenario: Blind player receives only current observation
- **WHEN** a user starts a blind-player Codex playtest and the browser requests a turn decision
- **THEN** the parent test orchestrator SHALL create the campaign's projectless Codex task, send it only the current observation JSON and player-decision prompt, then submit only its validated decision to the handoff.

### Requirement: Validated Codex decision submission
The repository SHALL provide a local CLI that reads a handoff request and atomically writes a matching decision only when the request is valid and the action is non-empty unless the decision explicitly stops the run.

#### Scenario: Valid decision submission
- **WHEN** Codex invokes the submission CLI with a current request, action, and intent
- **THEN** the CLI SHALL write a matching decision that the handoff provider can accept.

#### Scenario: Invalid action is rejected
- **WHEN** Codex invokes the submission CLI without an action and without a stop signal
- **THEN** the CLI SHALL exit non-zero and SHALL NOT create an accepted decision.

### Requirement: Authoritative turn and UI completion evidence
For every submitted turn, the driver SHALL verify a successful SSE response with a parseable `__VERSECRAFT_FINAL__` payload, wait for the visible input to recover, and retain both network and visible-page evidence.

#### Scenario: Live turn commits successfully
- **WHEN** the real chat gateway returns a normal turn
- **THEN** the trace SHALL include the action, final DM JSON, visible observation, response content type, and screenshot path, and the page SHALL not contain an application error.

#### Scenario: Gateway or final-frame failure
- **WHEN** a submitted turn does not produce a successful parseable final frame
- **THEN** the driver SHALL stop the run and persist the available failure evidence with the failed action.

### Requirement: Reproducible playthrough artifacts and persistence check
The driver SHALL write a JSON trace and per-turn screenshots under `.runtime-data/browser-playthrough/`, and the live browser E2E SHALL refresh the page after its multi-turn run to verify that a playable local session remains available.

#### Scenario: Browser run can be reproduced
- **WHEN** a browser playthrough completes or fails
- **THEN** its trace SHALL identify the run, ordered actions, termination reason, per-turn evidence, and any captured page errors.

#### Scenario: Local save survives a reload
- **WHEN** the live multi-turn browser E2E refreshes after a successful turn
- **THEN** `/play` SHALL expose the manual action input and the prior visible narrative SHALL remain present without an application error.
