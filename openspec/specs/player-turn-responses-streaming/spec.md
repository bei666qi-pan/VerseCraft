# Player Turn Responses Streaming Specification

## Purpose

Define the single narrow Writer terminal protocol and its streaming transport across OpenAI-compatible and Responses gateways.

## Requirements

### Requirement: PLAYER_CHAT SHALL use one narrow Writer terminal

The Writer SHALL submit exactly one `submit_narrative` call containing only `narrative`, four `options`, `turn_mode` and `decision_required`. The schema SHALL reject additional properties. It SHALL NOT contain health, sanity, inventory, task, location, NPC, relationship, world delta or commit fields.

#### Scenario: Writer submits a candidate

- **WHEN** a normal PLAYER_CHAT request reaches either supported gateway without caller-supplied tools
- **THEN** the request pins `tool_choice` to `submit_narrative` and its parameter schema contains exactly the four candidate fields

#### Scenario: Code projects candidate defaults

- **WHEN** the terminal arguments contain a valid narrow Writer candidate
- **THEN** server normalization projects deterministic non-authoritative defaults and the sole Turn Finalizer remains responsible for validation and commit

### Requirement: PLAYER_CHAT SHALL not retain a full DM terminal or compatibility model retry

The runtime SHALL NOT expose a state-bearing `submit_player_turn` or `submit_player_dm` Writer tool, a function-calling mode switch, or a tool-rejection retry that starts another generation request. Provider incompatibility SHALL surface to deterministic failure handling.

#### Scenario: Provider rejects tools

- **WHEN** the upstream provider rejects `tools` or `tool_choice`
- **THEN** the runtime makes no compatibility generation call and closes through the existing deterministic SSE failure path

### Requirement: Responses events SHALL preserve the PLAYER_CHAT stream contract

The Responses translator SHALL render `response.output_text.delta`, `response.function_call_arguments.delta`, completion and error events into the Chat-Completions-shaped stream consumed by the Turn Engine.

#### Scenario: Function arguments stream incrementally

- **WHEN** the upstream emits `submit_narrative` argument deltas
- **THEN** the deltas are projected to incremental content, parsed as one candidate and followed by exactly one authoritative FINAL produced by the Turn Finalizer

#### Scenario: Responses error terminates safely

- **WHEN** the upstream emits `response.error` or `response.failed`
- **THEN** the translator terminates its stream and leaves FINAL production to deterministic Turn Engine failure handling

### Requirement: Live latency SHALL measure concrete narrative separately from protocol bytes

The performance probe SHALL record the first actual character within the `narrative` value. JSON keys, quotes and tool-call metadata SHALL NOT count as concrete narrative. First visible text p95 SHALL remain at most 5 seconds and every normal turn SHALL begin concrete narrative within 8 seconds.

#### Scenario: Tool JSON prefix arrives without prose

- **WHEN** the stream has emitted only `{"narrative":"`
- **THEN** the concrete narrative timer remains unset

#### Scenario: First narrative character arrives

- **WHEN** the first non-whitespace character inside `narrative` arrives
- **THEN** the probe records its elapsed time and the live budget gate fails if it exceeds 8 seconds
