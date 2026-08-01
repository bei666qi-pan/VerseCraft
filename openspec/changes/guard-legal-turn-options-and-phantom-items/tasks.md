## 1. Regression Coverage

- [x] 1.1 Trace the authoritative production finalization hooks for options and inventory grounding without modifying eval infrastructure.
- [x] 1.2 Add focused regression tests for empty options on legal exploration turns and verify the options test fails before the fix.
- [x] 1.3 Add focused regression tests for an explicitly nonexistent inventory item and verify the item test fails before the fix.
- [x] 1.4 Add focused regression tests for approach-to-talk intent and SSE-safe empty-input rejection, and verify both fail before the fixes.

## 2. Production Guards

- [x] 2.1 Implement a deterministic legal-turn option fallback in the production finalization path.
- [x] 2.2 Implement a conservative authoritative-inventory guard for explicitly absent item use.
- [x] 2.3 Wire both guards into the existing final-frame workflow without changing the SSE/DM JSON contract.
- [x] 2.4 Make explicit dialogue dominate incidental approach movement in the authored-location production guard.
- [x] 2.5 Emit an early, non-consuming SSE rejection for empty input without invoking the model.

## 3. Verification

- [x] 3.1 Run the focused regression tests and relevant existing normalization/route contract tests.
- [x] 3.2 Run targeted lint/type checks, `git diff --check`, and OpenSpec validation.
- [x] 3.3 Confirm no test expectations, thresholds, holdouts, strict-gate files, or eval infrastructure were modified.

## 4. Live-eval regression follow-up

- [x] 4.1 Add failing regressions for confirmation-only repeated empty input and nested phantom-item state mirrors.
- [x] 4.2 Reject actionless confirmation markers before model execution and fully clear phantom-item state mirrors.
- [x] 4.3 Run the focused regression suite after the production fixes.
