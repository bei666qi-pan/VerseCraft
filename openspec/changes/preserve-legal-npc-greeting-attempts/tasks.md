## 1. Regression Coverage

- [x] 1.1 Add a production-guard regression for `golden-talk-to-npc-var-2` and verify it fails before the fix
- [x] 1.2 Add negative coverage proving coercive or violent social requests are not legalized

## 2. Production Fix

- [x] 2.1 Implement the narrow harmless-contact legality adjudication in `applyRegisteredMechanicsGuard`
- [x] 2.2 Prevent the adjudicated no-contact attempt from committing NPC relationship, location, or registration deltas

## 3. Verification

- [x] 3.1 Run the focused registered mechanics guard tests
- [x] 3.2 Run relevant contract tests, lint/type checks as feasible, and `git diff --check`

## 4. Follow-up Regression Coverage

- [x] 4.1 Add exact production-guard regressions for `golden-talk-to-npc-repeat-3` and `golden-talk-to-npc-var-2-var-3`, then verify both fail before the production fix

## 5. Follow-up Production Fix

- [x] 5.1 Recognize a target disappearing before contact as an unavailable-contact outcome
- [x] 5.2 Preserve harmless-contact legality after protocol-only narrative degradation with a deterministic no-contact fallback and no target-state commit

## 6. Follow-up Verification

- [x] 6.1 Run the focused production-guard tests and relevant route/contract checks
- [x] 6.2 Run lint/type checks as feasible and `git diff --check`

## 7. Direct-contact and named-absence follow-up

- [x] 7.1 Add exact failing regressions for `golden-talk-to-npc-var-2-npcswap-3`, `keepalive-normal-talk-repeat-3`, and `keepalive-normal-talk-var-2-var-3`
- [x] 7.2 Recognize direct `向某人了解` contact intent and explicit named-target absence or mismatch without broadening prohibited social actions
- [x] 7.3 Run the focused production-guard tests and contract verification

## 8. Original-case follow-up

- [x] 8.1 Add exact failing regressions for `golden-talk-to-npc` and `keepalive-normal-talk-var-3`
- [x] 8.2 Recognize anaphoric conversation phrasing and explicit `没这人` absence without broadening prohibited social actions
- [x] 8.3 Run focused tests, relevant contract checks, lint, and `git diff --check`

## 9. Deterministic round-3 follow-up

- [x] 9.1 Confirm the reported failures completed with parsed SSE finals and were not live-request timeouts
- [x] 9.2 Add failing exact-envelope regressions for `golden-talk-to-npc-npcswap-3` and `keepalive-normal-talk-repeat-3`
- [x] 9.3 Recognize redacted named-person denials and the audited entity-hard-gate fallback without broadening prohibited social actions
- [x] 9.4 Run focused production tests, route contract verification, lint, and `git diff --check`

## 10. Direct-inquiry wording follow-up

- [x] 10.1 Confirm `keepalive-normal-talk-var-2` and `keepalive-normal-talk-var-2-repeat-3` completed with parsed SSE finals and were not live-request timeouts
- [x] 10.2 Add failing production-guard regressions for both observed final shapes
- [x] 10.3 Recognize equivalent empty-corridor and explicit inability-to-contact wording without broadening prohibited social actions
- [x] 10.4 Run focused production tests, route contract verification, lint, and `git diff --check`

## 11. Latest deterministic no-contact wording

- [x] 11.1 Confirm `golden-talk-to-npc-npcswap-3` and `keepalive-normal-talk-var-2-repeat-3` returned parsed SSE finals with no timeout
- [x] 11.2 Add exact failing regressions for the latest live final narratives
- [x] 11.3 Recognize target-identity uncertainty, absent door-response evidence, and a resident's floor-level surname denial
- [x] 11.4 Run focused production tests, route contract verification, targeted lint, and `git diff --check`; full lint remains blocked by the pre-existing forbidden-file error in `scripts/self-improve/supervise.ts`
