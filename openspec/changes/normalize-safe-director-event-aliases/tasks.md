## 1. Deterministic parser repair

- [x] 1.1 Normalize the observed safe payload aliases before existing guard evaluation.
- [x] 1.2 Add regression tests for empty-array alias events and high-risk rejection.
- [x] 1.3 Normalize the real-worker `environmental_event` alias with the same narrow low-risk guard and regression coverage.

## 2. Real evidence

- [x] 2.1 Run focused unit/type/lint/OpenSpec validation and rerun the real Director worker probe until agenda and consumer pass.
- [x] 2.2 Rerun the real Director probe for the `environmental_event` evidence and record the persisted agenda/consumer result.
