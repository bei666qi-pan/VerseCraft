## 1. Deployment observation correctness

- [x] 1.1 Add focused tests for Coolify deployment lookup, queued-state handling, and terminal status normalization.
- [x] 1.2 Implement collection fallback and single-deployment monitoring in the Coolify client and self-heal runner.
- [x] 1.3 Add structured, credential-free phase-duration evidence to the deploy workflow.

## 2. Docker production build speed

- [x] 2.1 Add cache-capable pnpm store reuse while preserving frozen lockfiles and domestic registry fallback.
- [x] 2.2 Add Dockerfile contract coverage for cache, fallback, and production dependency isolation.

## 3. Verification and release

- [ ] 3.1 Run focused deployment tests, lint, and a production Docker build.
- [ ] 3.2 Validate the OpenSpec change and record observed before/after deployment phase evidence.
- [ ] 3.3 Ship through the normal PR and deployment workflow, then verify the public health endpoint.
