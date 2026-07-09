# Campaign 054 — 2/2 live fuzz (speedrunner)

**Date:** 2026-07-09
**Recipe:** live (DM via dev server, player brain via one-api)
**Runs:** 2 (speedrunner × 2 runs)
**Max steps:** 10
**Gate:** ✅ 通过 (100%)
**Total time:** 63.7s (~32s per run)

## Results

| Persona | Run | Steps | Termination |
|---|---|---|---|
| speedrunner | 1 | 10 | max_steps |
| speedrunner | 2 | 10 | max_steps |

## Notes

- First successful live_fuzz campaign. Both DM narrative (via dev server) and player actions (via one-api gateway) use real API calls.
- No 429 errors. mimo-v2.5 with jsonMode: true works correctly.

