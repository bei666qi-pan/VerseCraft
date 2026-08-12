# Tasks: integrate-langfuse-platform

## Phase 0: Foundation

- [x] **0.1** Create `src/lib/observability/langfuse/` directory structure
- [x] **0.2** Implement `types.ts` — all local type definitions
- [x] **0.3** Implement `config.ts` — `LangfuseConfig`, env resolution, `VERSECRAFT_ENABLE_LANGFUSE` flag
- [x] **0.4** Implement `privacy.ts` — HMAC hashing for userId/sessionId, content redaction helpers
- [x] **0.5** Implement `sampling.ts` — deterministic head sampling based on requestId
- [x] **0.6** Implement `noop.ts` — no-op implementations of all observability interfaces
- [x] **0.7** Add unit tests for config, privacy, sampling

## Phase 1: Core Tracing

- [x] **1.1** Add dependencies: `@langfuse/tracing`, `@langfuse/otel`, `@langfuse/client`, `@opentelemetry/sdk-node`
- [x] **1.2** Implement `client.ts` — OTel NodeSDK init with `LangfuseSpanProcessor`, shutdown hook
- [x] **1.3** Implement `tracing.ts` — adapter layer: `startTrace()`, `startSpan()`, `startGeneration()`, `endObservation()`, `addScore()`
- [x] **1.4** Wire `client.ts` into `src/instrumentation.ts` (gated behind `VERSECRAFT_ENABLE_LANGFUSE`)
- [x] **1.5** Add unit tests for client init, tracing adapter, no-op fallback
- [x] **1.6** Verify `pnpm build` passes

## Phase 2: AI Router Instrumentation

- [x] **2.1** Instrument `executePlayerChatStream` in `src/lib/ai/router/execute.ts` — wrap each model attempt in a generation
- [x] **2.2** Instrument `executeChatCompletion` — wrap non-streaming AI calls in generations
- [x] **2.3** Map `AiCostRecord` fields to Langfuse generation attributes
- [x] **2.4** Add generation fields: model, usage, ttft, finish_reason, attempt, cost
- [x] **2.5** Add unit tests for generation instrumentation
- [ ] **2.6** Verify existing AI tests pass

## Phase 3: /api/chat Workflow Spans

- [ ] **3.1** Create helper to wrap `/api/chat` pipeline stages in spans
- [x] **3.2** Add trace root in `postChatInternal` with trace-level attributes
- [ ] **3.3** Add spans for: request_validation, input_safety, risk_and_quota, context_retrieval, prompt_build
- [ ] **3.4** Add spans for: dm_normalize, narrative_validate, turn_commit, final_hooks, analytics_enqueue
- [x] **3.5** Update trace with final turn summary after `resolveDmTurn`
- [ ] **3.6** Handle early return, error, and client disconnect paths (spans must be ended)
- [ ] **3.7** Verify SSE contract tests pass
- [ ] **3.8** Verify latency budget tests pass

## Phase 4: Prompt Management

- [x] **4.1** Implement `src/lib/observability/langfuse/prompts.ts` — LangfuseClient wrapper
- [x] **4.2** Implement shadow mode: async compare local vs remote prompt hash
- [x] **4.3** Implement cached remote fetch with timeout and local fallback
- [x] **4.4** Add config for `promptSource` and per-prompt name mapping
- [ ] **4.5** Add unit tests for prompt management
- [ ] **4.6** Document prompt publishing workflow (manual, via Langfuse UI)

## Phase 5: Evaluation Score Upload

- [x] **5.1** Implement `src/lib/observability/langfuse/scores.ts` — score upload adapter
- [x] **5.2** Map existing eval dimensions to Langfuse score names
- [x] **5.3** Add `--upload-langfuse` CLI flag to eval scripts
- [ ] **5.4** Implement dataset run linking for offline evals
- [ ] **5.5** Add unit tests for score mapping
- [ ] **5.6** Add `src/lib/observability/langfuse/eval.ts` — eval result adapter

## Phase 6: Hardening & Documentation

- [ ] **6.1** Add self-protection: bounded queue, error rate limiting, no recursive logging
- [ ] **6.2** Add telemetry for Langfuse export health (logged locally, not to Langfuse)
- [x] **6.3** Document architecture, configuration, and operational playbook
- [x] **6.4** Add `.env.example` entries for all Langfuse vars
- [ ] **6.5** Final `pnpm build` + `pnpm lint` + `pnpm test:unit` verification
- [ ] **6.6** Final `pnpm test:e2e:contract` verification
- [ ] **6.7** Final `pnpm benchmark:chat:mock` verification
