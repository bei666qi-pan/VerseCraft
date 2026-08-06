# Proposal: integrate-langfuse-platform

## Summary

Systematically introduce Langfuse as the LLM Observability, Prompt Management, and Evaluation infrastructure for VerseCraft. Not a simple SDK drop-in — an auditable, grayscale-capable, fail-open platform integration that parallels (not replaces) existing PostgreSQL analytics.

## Motivation

- **No structured LLM observability.** Current telemetry is console logs + Redis ring buffer + DEEPSEEK_METER_URL. No trace/span hierarchy, no cross-request aggregation, no retention.
- **No prompt version management.** Stable prompts live in TypeScript source; no versioning, labeling, or experiment tracking.
- **No centralized eval scores.** Each eval script writes JSON+JSONL locally; no aggregation or trending.
- **Blind to model fallback chains.** Each fetch attempt is logged independently; no correlated view of retry/fallback across roles.

## Scope

### In Scope

1. Langfuse tracing with OTel-based SDK (`@langfuse/tracing` + `@langfuse/otel`)
2. Generation instrumentation in AI router layer
3. Stage spans for `/api/chat` workflow phases
4. Privacy/redaction layer (metadata-only, HMAC-hashed identities)
5. Deterministic sampling based on requestId
6. Config layer with feature flags
7. Prompt management client (shadow mode initially)
8. Score upload adapter for existing eval suites
9. Graceful degradation when Langfuse is unavailable

### Out of Scope

- Replacing PostgreSQL analytics
- Replacing `resolveDmTurn` or authoritative state commit
- Changing SSE contract, DM JSON format, or `keys_missing` behavior
- Using OpenAI wrapper to replace existing provider/router
- Uploading full prompts, narratives, or player input to Langfuse
- Automatic prompt publishing to production
- Real Langfuse access in unit tests or CI

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| SDK bug crashes `/api/chat` | Fail-open design; no-op on any error; feature flag |
| Performance regression | Async export; no blocking in first-byte path; bounded flush |
| Secret leakage | HMAC-hashed identities with dedicated salt; content never uploaded |
| Dependency conflict | Pin exact versions; test install + build |
| Test flakiness | No-op transport in test; mockable adapter |

## Affected Contracts

Per AGENTS.md §3, this touches:
- `/api/chat` / SSE (new instrumentation, not contract change)
- AI routing/prompt (generation instrumentation)
- analytics (coexistence not replacement)
- cognitive filtering / post-generation validator (span tags only)

## References

- Langfuse JS/TS SDK v5 (modular: `@langfuse/tracing`, `@langfuse/otel`, `@langfuse/client`)
- Langfuse docs: https://langfuse.com/docs
- `src/lib/ai/logicalTasks.ts`, `src/lib/ai/router/execute.ts`, `src/lib/ai/telemetry/log.ts`
- `src/app/api/chat/route.ts`
- `src/instrumentation.ts`
