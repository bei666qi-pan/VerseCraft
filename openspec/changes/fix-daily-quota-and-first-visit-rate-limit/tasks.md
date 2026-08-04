## 1. Anonymous chat admission

- [x] 1.1 Add a guarded, server-issued anonymous browser identity and use it as the `/api/chat` limiter fallback without weakening the existing per-bucket threshold.
- [x] 1.2 Add middleware regression coverage for first-visit isolation, fallback/flag behavior, and exhausted buckets.

## 2. Daily quota refresh communication

- [x] 2.1 Add typed UTC daily-window and next-refresh helpers, then expose the refresh instant on quota check outcomes for both actor types.
- [x] 2.2 Include the exact Beijing-time refresh timestamp in token/action-limit narrative while preserving ban behavior and the existing SSE final envelope.
- [x] 2.3 Add unit coverage for registered and guest cross-day usage, refresh-time formatting, and quota rejection messages.

## 3. Verification

- [x] 3.1 Run targeted middleware/quota tests, chat SSE contract tests, lint, OpenSpec strict validation, and a local `/play` browser check when the local runtime is available.
