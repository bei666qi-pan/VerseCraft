## 1. Final narrative evidence

- [x] 1.1 Add a pure final-length assessment that classifies budget shortfall and expansion outcome without reading IO or mutating state.
- [x] 1.2 Wire the assessment into `/api/chat` final-hook telemetry while preserving SSE, state deltas and existing expansion fallback; allow constrained short-turn expansion when it is below its explicit minimum.
- [x] 1.3 Add unit and route-contract coverage for standard shortfall, safe successful expansion and safety/death exemptions.

## 2. Live validation

- [x] 2.1 Align the live benchmark's normal-exploration quality gate with the authoritative narrative budget and report an actionable shortfall reason.
- [x] 2.2 Run lint, relevant unit/contract tests, strict OpenSpec validation, real-gateway multi-run benchmark and latency budget gate.
