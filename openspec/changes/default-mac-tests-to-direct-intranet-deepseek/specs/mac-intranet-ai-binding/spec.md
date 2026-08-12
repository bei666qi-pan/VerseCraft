## ADDED Requirements

### Requirement: Mac local testing uses the direct corporate DeepSeek endpoint
The local Mac configuration SHALL use the configured Sangfor OpenAI-compatible endpoint directly and MUST NOT require a listener on `127.0.0.1:4319` for ordinary gameplay or live evaluation.

#### Scenario: Local gameplay with aTrust connected
- **WHEN** a developer starts VerseCraft from an ordinary Mac terminal with the local environment file
- **THEN** `PLAYER_CHAT` requests SHALL resolve to the corporate DeepSeek `/v1/chat/completions` endpoint without contacting port 4319

#### Scenario: Corporate route unavailable
- **WHEN** the Mac cannot reach the corporate DeepSeek endpoint
- **THEN** `/api/chat` SHALL use its existing observable SSE degradation and MUST NOT silently switch to an unrelated public provider

### Requirement: Player and offline model bindings remain task-scoped
The local binding SHALL route player-visible chat to the configured Flash model with thinking disabled, while non-player and offline logical roles SHALL retain their separately configured Pro model bindings.

#### Scenario: Player chat model resolution
- **WHEN** the AI router resolves a `PLAYER_CHAT` request in the local Mac environment
- **THEN** it SHALL select `deepseek-v4-flash` and apply the player-chat no-thinking request body

#### Scenario: Offline judge model resolution
- **WHEN** an offline evaluation or judge resolves a reasoner-capable logical role
- **THEN** it SHALL continue selecting the configured Pro model rather than inheriting the player Flash binding

### Requirement: Credentials remain local and production remains unchanged
Corporate gateway credentials MUST remain in ignored local configuration, and this change SHALL NOT alter production/Coolify environment values, SSE/DM JSON contracts, state commit behavior, analytics schemas, or database schemas.

#### Scenario: Repository inspection
- **WHEN** tracked implementation and documentation changes are reviewed
- **THEN** they SHALL contain no corporate credential value and no production routing mutation
