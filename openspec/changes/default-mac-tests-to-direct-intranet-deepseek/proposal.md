## Why

Local Mac gameplay and live-evaluation runs currently point at a loopback gateway on `127.0.0.1:4319`, making `/api/chat` depend on an unrelated helper process that is often absent. The existing project credential can reach the Sangfor intranet DeepSeek gateway directly, so local testing should use that stable binding by default.

## What Changes

- Configure this Mac's local VerseCraft environment to call `https://aigateway.sangfor.com/v1` directly instead of `127.0.0.1:4319`.
- Route `PLAYER_CHAT` to `deepseek-v4-flash` with provider thinking disabled, while retaining DeepSeek Pro role bindings for offline and non-player tasks.
- Document that aTrust connectivity is required and that an unavailable intranet route continues to use the existing `200 + SSE` degraded response rather than silently falling back to an unrelated public provider.
- Add configuration regression coverage proving direct OpenAI-compatible intranet URLs normalize to `/v1/chat/completions` and player-specific model selection remains task-scoped.
- Keep secrets local; no credential is added to tracked files.

## Capabilities

### New Capabilities

- `mac-intranet-ai-binding`: Defines the direct, non-loopback DeepSeek binding used for local Mac gameplay and live evaluation.

### Modified Capabilities

None.

## Impact

- Affected areas: local `.env.local`, AI configuration tests, and local AI gateway documentation.
- `/api/chat` continues to return `text/event-stream`, status frames, and authoritative `__VERSECRAFT_FINAL__` frames; DM JSON, state commit, analytics schema/event names, database schema, authentication, and save compatibility are unchanged.
- Direct routing removes a local proxy hop and should reduce failure modes and small amounts of latency. If aTrust is disconnected, the existing gateway-failure SSE degradation remains the rollback path.
- No production/Coolify variables are changed. No new prompt, validator, feature flag, or online work is introduced.
