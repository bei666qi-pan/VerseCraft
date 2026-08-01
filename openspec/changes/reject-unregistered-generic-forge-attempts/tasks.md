## 1. Regression

- [ ] 1.1 Add the exact `boundary-forge-insufficient-materials-qty-3` production regression and verify it fails before the fix

## 2. Production fix

- [ ] 2.1 Deterministically reject generic unregistered weapon-forging attempts with zero resource or item mutation
- [ ] 2.2 Preserve registered B1 forge execution and quote behavior

## 3. Verification

- [ ] 3.1 Run focused deterministic service and route contract tests
- [ ] 3.2 Run lint/type checks as feasible and `git diff --check`
