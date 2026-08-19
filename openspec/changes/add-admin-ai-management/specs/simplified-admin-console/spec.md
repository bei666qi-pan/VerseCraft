## ADDED Requirements

### Requirement: Admin console uses four plain-language destinations
The admin console SHALL expose exactly four primary destinations: 运营概览, AI 管理, 玩家与反馈, and 系统状态. Existing detailed capabilities SHALL remain reachable inside those destinations without exposing internal identifiers by default.

#### Scenario: Non-technical administrator opens the console
- **WHEN** an authenticated administrator opens `/saiduhsa`
- **THEN** the primary navigation contains the four destinations and visible status/error copy uses actionable Simplified Chinese rather than environment variables, SQL sources, raw codes, or JSON

### Requirement: AI management supports observation and configuration in one workflow
The AI 管理 destination SHALL show selected-range Token usage, estimated RMB cost when priced, success rate, active services, trends and rankings, plus service/model editing and route ordering workflows.

#### Scenario: Administrator changes an API key
- **WHEN** the administrator edits a service with a replacement key
- **THEN** the existing key is never revealed and the UI activates the replacement only after a successful test

### Requirement: Admin console is accessible and responsive
The console SHALL support keyboard operation, visible focus, readable contrast, mobile navigation, stacked data rows, and a full-screen mobile service editor without horizontal overflow at the supported play-shell widths.

#### Scenario: AI service is edited on a narrow screen
- **WHEN** the viewport is 390 pixels wide
- **THEN** navigation remains usable, service data becomes readable stacked rows, and the editor occupies the screen without clipping its actions

