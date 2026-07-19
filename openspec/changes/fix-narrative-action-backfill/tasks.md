## 1. Bounded action-backfill repair

- [x] 1.1 Correct the `validateNarrative` resolver call to pass the parsed existing currency delta and retain only audit telemetry, never narrative-derived state.
- [x] 1.2 Resolve strict TypeScript errors in the adjacent final commit path without changing its state gate semantics.

## 2. Regression evidence

- [x] 2.1 Add validator-level tests for supported action telemetry, preservation of structured fields, and conservative unsupported behavior.
- [x] 2.2 Run the focused validator/action-resolver/commit tests, strict type checks for touched modules, lint, OpenSpec strict validation, and diff check.
