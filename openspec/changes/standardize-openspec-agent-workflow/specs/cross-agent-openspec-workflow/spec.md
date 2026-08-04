## ADDED Requirements

### Requirement: Tool-neutral OpenSpec task dispatch
The repository SHALL define OpenSpec task dispatch in the root `AGENTS.md` as a default workflow for every coding agent, including agents that do not provide a client-specific OpenSpec command.

#### Scenario: A supported coding agent starts a behavior-changing task
- **WHEN** Codex, Claude Code, Cursor, Kimi Code, or another agent that reads the repository instructions receives a task that changes behavior, spans multiple modules, requires a design trade-off, or changes tests
- **THEN** it SHALL evaluate the task against the repository's OpenSpec lightweight and mandatory change rules before implementation without requiring the user to name OpenSpec.

#### Scenario: A direct-execution exception is received
- **WHEN** an agent receives a pure question, read-only inspection, wording-only correction, no-behavior single-file edit, existing change follow-up, or narrowly located bug fix
- **THEN** it SHALL be allowed to execute directly while preserving the repository's verification and contract rules.

### Requirement: Project-local OpenSpec adapters for supported clients
The repository SHALL provide project-local OpenSpec adapters for Codex, Claude Code, Cursor, and Kimi Code using the OpenSpec CLI's supported installation layout.

#### Scenario: A supported client opens a clone
- **WHEN** a developer opens a clone with Codex, Claude Code, Cursor, or Kimi Code
- **THEN** the client SHALL be able to discover the project's OpenSpec skills, and clients with a supported command adapter SHALL also discover the OpenSpec slash commands after their normal reload step.

#### Scenario: Kimi Code starts a project task
- **WHEN** Kimi Code starts in the repository root or a descendant directory
- **THEN** it SHALL receive the root `AGENTS.md` workflow and discover the project-local OpenSpec skills without relying on a user-level configuration file.

### Requirement: Safe completion and maintenance workflow
The cross-agent workflow SHALL require relevant validation and OpenSpec status/spec synchronization before a completed change is represented as complete, and it MUST NOT instruct an agent to commit, push, or deploy without explicit user authorization.

#### Scenario: A planned change finishes implementation
- **WHEN** an agent completes all implementation tasks for an OpenSpec change
- **THEN** it SHALL run the applicable validation, update the task evidence, and synchronize delta specs when required before reporting completion.

#### Scenario: Cursor completes an ordinary coding task
- **WHEN** a Cursor agent completes an implementation task without an explicit user request to commit or deploy
- **THEN** it SHALL NOT run the repository ship or deployment command automatically.
