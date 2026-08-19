## 1. Data and security foundation

- [x] 1.1 Add Drizzle schema, SQL migration, runtime schema compatibility, indexes, and relations for AI services, models, routes, config state, usage events, and daily usage.
- [x] 1.2 Implement AES-256-GCM key encryption/decryption, key parsing, masking, fail-closed health, and security unit tests.
- [x] 1.3 Implement production-safe service URL/DNS/redirect validation and bounded connection probes with unit tests.

## 2. Runtime configuration and routing

- [x] 2.1 Implement purpose/task mappings, immutable runtime snapshots, database loading, mock snapshots, version polling, and Redis invalidation.
- [x] 2.2 Refactor generation routing to iterate service/model bindings, preserve role safety, and isolate fallback/circuits by service/model.
- [x] 2.3 Refactor embedding bindings for managed OpenAI-compatible and Ark multimodal models, including dimension validation.
- [x] 2.4 Preserve `/api/chat` `keys_missing`, SSE/final-frame, no-first-token-DB-I/O, and mock benchmark contracts.

## 3. Usage ledger

- [x] 3.1 Implement privacy-safe idempotent usage records, Token estimation, RMB price snapshots, and bounded asynchronous batch persistence.
- [x] 3.2 Connect generation and embedding attempt outcomes to the ledger without changing existing analytics event contracts.
- [x] 3.3 Implement daily rollup plus 90-day detail retention and tests for idempotency, pricing, estimates, and cleanup ordering.

## 4. Admin APIs and console

- [x] 4.1 Implement authenticated, same-origin, rate-limited service/model CRUD, test, enable/disable, soft-delete, and route-order APIs with secret-free audit logs.
- [x] 4.2 Implement AI overview/range queries for totals, trends, purpose/service/model ranks, issues, and estimate disclosure.
- [x] 4.3 Refactor the admin console into four plain-language destinations and implement responsive AI management rows/drawer workflows.
- [x] 4.4 Update admin API/UI E2E coverage for authorization, secret redaction, atomic activation, four-entry navigation, responsive behavior, and friendly errors.

## 5. Hard cutover and verification

- [x] 5.1 Remove production NewAPI/one-api, legacy gateway/model/Kimi/Ark secret resolution and external meter posting while retaining `AI_PROVIDER=mock`.
- [x] 5.2 Update deployment, AI configuration, troubleshooting, local development, and environment documentation for managed services and `AI_CONFIG_ENCRYPTION_KEY`.
- [x] 5.3 Run focused unit tests, lint, build, admin E2E, SSE contract tests, mock chat benchmark, and resolve task-caused failures.
- [x] 5.4 Run the required frontend design review Mode 1 after the UI is runnable, apply verified corrections, and recheck desktop plus 390×844, 393×852, and 430×932.
