# Design: integrate-langfuse-platform

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    /api/chat (route.ts)                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  LangfuseTrace (root span: "versecraft.chat.turn")       ││
│  │  ├── span: chat.request_validation                       ││
│  │  ├── span: chat.input_safety                             ││
│  │  ├── span: chat.risk_and_quota                          ││
│  │  ├── span: chat.context_retrieval                        ││
│  │  ├── span: chat.prompt_build                             ││
│  │  ├── span: chat.model_stream                            ││
│  │  │   └── generation: ai.PLAYER_CHAT.writer (attempt 1)   ││
│  │  │   └── generation: ai.PLAYER_CHAT.main  (fallback)     ││
│  │  ├── span: chat.dm_normalize                             ││
│  │  ├── span: chat.narrative_validate                       ││
│  │  ├── span: chat.turn_commit                              ││
│  │  ├── span: chat.final_hooks                              ││
│  │  └── span: chat.analytics_enqueue                        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Module Boundaries

### `src/lib/observability/langfuse/` (new directory)

```
langfuse/
├── types.ts          # Local type definitions
├── config.ts         # LangfuseConfig, env resolution, feature flags
├── client.ts         # OTel NodeSDK init + LangfuseSpanProcessor, shutdown
├── tracing.ts        # Trace/Span/Generation helpers (the adapter)
├── privacy.ts        # HMAC hashing, content redaction
├── sampling.ts       # Deterministic head sampling
└── noop.ts           # No-op implementations for disabled state
```

### Key Design Decisions

**1. OTel-native, not Langfuse Classic SDK**

Modern Langfuse SDK (v5) is OTel-based: `@langfuse/tracing` + `@langfuse/otel` + `@opentelemetry/sdk-node`. This gives us:
- Standard span context propagation
- Ecosystem interoperability
- Langfuse-specific wrappers (LangfuseSpan, LangfuseGeneration) over standard OTel spans

**2. Fail-Open Architecture**

Every Langfuse operation is wrapped in try-catch. Any SDK error, network failure, timeout, or auth error is caught, logged once, and the no-op path is used. The no-op implementation implements the same interface with zero side effects.

**3. Adapter Pattern, Not Direct SDK Calls**

Business code never calls `@langfuse/tracing` or `@langfuse/otel` directly. Instead:
- `src/lib/observability/langfuse/tracing.ts` exports `startTrace()`, `startSpan()`, `startGeneration()`, `endObservation()`, `addScore()`
- These functions internally route to real Langfuse or no-op based on config
- Business code imports only from the adapter

**4. Privacy by Default**

- All identity fields (userId, sessionId) are HMAC-SHA256 hashed with a dedicated salt
- Content (prompts, narratives, messages) is NEVER sent to Langfuse
- Only structured metadata: counts, lengths, hashes, enums, budgets

**5. Deterministic Sampling**

Head sampling based on `requestId`:
```ts
sampleRate = config.sampleRate; // e.g., 0.1 for 10%
isSampled = deterministicHash(requestId) % 10000 < sampleRate * 10000;
```
This ensures the same requestId always samples identically, enabling replay/debugging.

**6. Prompt Management — Shadow First**

Three modes: `local` (default), `shadow` (async compare), `remote` (with cache). Phase 1 only implements `local` and `shadow` for stable templates. Remote fetch is never on the first-byte critical path.

**7. Score Upload — Async, Non-Blocking**

Existing eval scripts get an optional `--upload-langfuse` flag. Score upload failures never fail the eval itself. Scores use the `@langfuse/client` package (separate from tracing).

## Configuration

```ts
interface LangfuseConfig {
  enabled: boolean;
  publicKey?: string;
  secretKey?: string;
  baseUrl: string;
  environment: string;
  release?: string;
  sampleRate: number;        // 0..1
  captureContent: boolean;   // default false
  promptSource: 'local' | 'shadow' | 'remote';
  flushTimeoutMs: number;
  hashSalt: string;
}
```

Environment variables follow Langfuse canonical names:
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_BASE_URL`

Plus VerseCraft-specific:
- `VERSECRAFT_ENABLE_LANGFUSE` (feature flag, default false)
- `VERSECRAFT_LANGFUSE_SAMPLE_RATE` (default 0 for local, 1 for staging, 0.1 for production)
- `VERSECRAFT_LANGFUSE_CAPTURE_CONTENT` (default false, triple-gated for production)
- `VERSECRAFT_LANGFUSE_PROMPT_SOURCE` (local | shadow | remote)
- `VERSECRAFT_LANGFUSE_FLUSH_TIMEOUT_MS`
- `VERSECRAFT_LANGFUSE_HASH_SALT`

## Initialization Flow

```
instrumentation.ts (register)
  └── if VERSECRAFT_ENABLE_LANGFUSE:
        └── initLangfuse()
              ├── Resolve config from env
              ├── Create OTel NodeSDK with LangfuseSpanProcessor
              ├── Start SDK
              └── Register shutdown hook (SIGTERM/SIGINT)
```

## Dependency Plan

```
pnpm add @langfuse/tracing @langfuse/otel @langfuse/client @opentelemetry/sdk-node
```

These are the official current-recommended packages per Langfuse docs. Not the legacy `langfuse@3.x` monolith.
