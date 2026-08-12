## ADDED Requirements

### Requirement: Evaluation campaigns are non-mutating
The offline evaluation campaign SHALL execute scenarios, collect deterministic and optional model evidence, triage defects, run quality gates, and write runtime reports without editing tracked repository files or spawning a code-writing agent.

#### Scenario: Strict gate finds a product defect
- **WHEN** a campaign identifies a repairable product or parse-contract defect
- **THEN** it SHALL record the defect evidence and an implementation recommendation, and SHALL NOT invoke Codex or another writer to modify source files

#### Scenario: External model or infrastructure fails
- **WHEN** gateway, timeout, authentication, or infrastructure evidence is insufficient
- **THEN** the campaign SHALL classify the run as blocked or inconclusive according to existing strict-gate rules and SHALL NOT send the failure to a code writer

### Requirement: Reports provide an explicit implementation handoff
Every reported defect recommendation SHALL identify the affected case or invariant, evidence location, severity or confidence where available, and the validation expected after an explicit repair task. Reports MUST distinguish recommendations from completed repairs.

#### Scenario: Defect report is generated
- **WHEN** triage confirms one or more defects
- **THEN** the report SHALL expose actionable recommendations and SHALL report zero applied code repairs for that evaluation run

#### Scenario: Clean evidence is insufficient
- **WHEN** no defect is found but coverage, repeated runs, calibration, holdout, or another strict requirement is incomplete
- **THEN** the campaign SHALL continue or stop as insufficient evidence and SHALL NOT claim that autonomous repair succeeded

### Requirement: Supported commands use evaluation terminology
The repository SHALL expose documented `eval:*` commands for campaign execution, baseline creation, reporting, and strict verification. Legacy non-mutating `self-improve:*` commands MAY remain as compatibility aliases, but mutation-capable supervisor and repair-backend commands SHALL NOT be supported.

#### Scenario: Developer runs the supported campaign
- **WHEN** a developer invokes `pnpm eval:campaign`
- **THEN** the repository SHALL run the staged evaluation campaign and write its evidence report

#### Scenario: Legacy evaluator alias is used
- **WHEN** a developer invokes a retained non-mutating `self-improve:*` alias
- **THEN** it SHALL execute the corresponding evaluation behavior without enabling automatic code modification

### Requirement: Unrelated bounded loops remain out of scope
The change SHALL NOT alter the bounded online DM tool loop or the Coolify deployment retry/diagnosis loop, and documentation SHALL distinguish them from offline code-repair automation.

#### Scenario: Online DM turn executes
- **WHEN** the existing DM Agent feature flag enables bounded tool use
- **THEN** its existing round, timeout, validation, and fallback behavior SHALL remain unchanged

#### Scenario: Deployment fails transiently
- **WHEN** the existing deployment self-heal script classifies a failure as transient infrastructure
- **THEN** its bounded deployment retry behavior SHALL remain unchanged and SHALL continue to avoid source-code modification

### Requirement: Operations automation cannot write product code
Operations automation SHALL be limited to evidence collection and deterministic operational remediation. It SHALL NOT invoke a generative code writer, commit generated changes, or push generated changes to a repository branch.

#### Scenario: Health monitor detects an incident
- **WHEN** the operations monitor detects repeated health failures
- **THEN** it MAY collect diagnostics and perform the existing bounded Coolify restart, but SHALL NOT ask Codex or another model to edit source code

#### Scenario: Incident requires code changes
- **WHEN** operational evidence indicates that a code or configuration change is required
- **THEN** the system SHALL preserve the incident evidence for an explicit implementation task and SHALL NOT commit or push a generated repair
