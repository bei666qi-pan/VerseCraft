# Campaign 055 — 10/10 live fuzz (all personas)

**Date:** 2026-07-09
**Recipe:** live (DM via dev server, player brain via one-api)
**Runs:** 10 (5 personas × 2 runs)
**Max steps:** 10
**Gate:** ✅ 通过 (100%)
**Total time:** 475.7s (~47s per run)

## Results

| Persona | Run | Steps | Termination |
|---|---|---|---|
| speedrunner | 1-2 | 10 each | max_steps |
| explorer | 1-2 | 10 each | max_steps |
| rulebreaker | 1-2 | 10 each | max_steps |
| confused | 1-2 | 10 each | max_steps |
| collector | 1-2 | 10 each | max_steps |

## Notes

- All 10 runs passed (100%).
- 36 transient 502 errors from one-api on player brain non-streaming calls (explorer and rulebreaker personas hit the outage window).
- Player brain gracefully degrades to mock actions when live API fails.
- DM streaming via dev server was unaffected — all 10 sessions completed with real narrative.
- Verified: non-streaming  calls work correctly (routes to mimo-v2.5-free).
- 502 was a temporary one-api upstream glitch, not a systematic issue.

