## 1. Bounded repair budget

- [x] 1.1 Raise the shared final-repair default to 6,000 ms while retaining existing clamp and environment override; malformed-DM remains a bounded 4,000 ms request and post-validator narrative repair can use the full 6,000 ms.
- [x] 1.2 Add a route-contract regression asserting the default, bounds and post-generation placement.
- [x] 1.3 Route non-injection entity hard blocks through one bounded narrative-only repair before deterministic fallback, then revalidate the repaired candidate.
- [x] 1.4 Align the narrative-repair logical-task clamp with the shared six-second final-repair window.

## 2. Verification

- [x] 2.1 Run targeted unit/contract tests, lint, strict OpenSpec validation and a real gateway/API probe; report the malformed live trace as pre-fix evidence unless an actual malformed response is reproduced.
