## 1. Canonical movement resolution

- [x] 1.1 Connect the real `3F_Hallway` opening node to its registered stairwell edge and cover graph reachability.
- [x] 1.2 Extend the post-generation location guard with bounded Chinese aliases and one-edge vertical movement synthesis behind a rollout flag.
- [x] 1.3 Strip invalid model location deltas without rejecting non-movement actions; retain conservative no-movement fallback for unconfirmable movement.

## 2. Verification

- [x] 2.1 Add pure tests for legacy start, one-edge descent, alias/candidate normalization, no multi-hop, invalid observation delta and rollout-disabled behavior.
- [x] 2.2 Run targeted tests, route/SSE contract, lint, OpenSpec strict validation and a real `/api/chat` two-step movement trace; record any remaining playthrough limitation.
