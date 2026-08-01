## 1. Regression Coverage

- [x] 1.1 Add a strict-verifier regression test reproducing timed-out cases being reported as unique gameplay failures.
- [x] 1.2 Run the targeted test and record the expected pre-fix failure.

## 2. Evidence Classification

- [x] 2.1 Exclude errored deterministic cases from oracle scoring and defect clustering.
- [x] 2.2 Return insufficient evidence and exit code 2 when errored deterministic cases are present.

## 3. Verification

- [x] 3.1 Run targeted self-improvement evaluator tests.
- [x] 3.2 Run lint/type-relevant checks and OpenSpec validation; confirm no expectations, thresholds, or holdouts changed.
