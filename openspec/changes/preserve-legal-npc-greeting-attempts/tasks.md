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

- [ ] 6.1 Run the focused production-guard tests and relevant route/contract checks
- [ ] 6.2 Run lint/type checks as feasible and `git diff --check`
