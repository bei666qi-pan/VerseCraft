# Campaign 066 — 15/15 live fuzz (all personas, 15 steps)

**Date:** 2026-07-09
**Recipe:** live (DM via dev server, player brain via one-api)
**Runs:** 15 (5 personas × 3 runs)
**Max steps:** 15
**Gate:** ✅ 通过 (100%)
**Total time:** 1330.8s (~22 min, ~89s per run)

## Results

| Persona | Run | Steps | Termination |
|---|---|---|---|
| speedrunner | 1-3 | 15 each | max_steps |
| explorer | 1-3 | 15 each | max_steps |
| rulebreaker | 1-3 | 15 each | max_steps |
| confused | 1-3 | 15 each | max_steps |
| collector | 1-3 | 15 each | max_steps |

## Notes

- All 15 runs passed (100%).
- DM narrative via dev server (`localhost:666`) worked flawlessly for all 225 steps.
- Player brain faced heavy 429 rate limiting from one-api gateway (~10/min group RPM limit).
- 502 upstream errors also appeared (~5% of calls), degrading quickly to mock fallback.
- Graceful degradation confirmed: player actions fall back to mock, runs complete normally.
- Running 15 concurrent player action calls at ~5s intervals would exceed the RPM budget.
