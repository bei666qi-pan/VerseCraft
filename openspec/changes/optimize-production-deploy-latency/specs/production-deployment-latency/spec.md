## ADDED Requirements

### Requirement: Reusable production dependency acquisition
The production Docker build SHALL reuse a lockfile-keyed pnpm package-store cache when the builder supports it, while retaining frozen-lockfile installation and the existing bounded domestic registry fallback when the cache is unavailable or misses.

#### Scenario: Source-only release with an unchanged lockfile
- **WHEN** a production build runs with an unchanged `pnpm-lock.yaml` on a cache-capable builder
- **THEN** the dependency installation SHALL reuse the package store without copying stale `node_modules` into the image

#### Scenario: Cache miss or unsupported builder
- **WHEN** the package-store cache is absent or unsupported
- **THEN** the build SHALL install from the configured primary registry and fall back to the configured secondary registry within the existing bounded timeout behavior

### Requirement: Single authoritative Coolify deployment monitor
The deployment helper SHALL resolve a triggered deployment through either its UUID endpoint or the active deployments collection, and SHALL treat an observed queued or active deployment as progress rather than trigger another deployment.

#### Scenario: Per-deployment status endpoint is unavailable
- **WHEN** the direct Coolify deployment status endpoint returns an unavailable or non-status payload
- **THEN** the helper SHALL find the same UUID in the deployments collection and continue monitoring it

#### Scenario: Deployment remains queued behind another release
- **WHEN** a triggered deployment is queued while another deployment is active
- **THEN** the helper SHALL continue observing the queued deployment and SHALL NOT enqueue a duplicate retry

### Requirement: Deployment phase evidence
The deployment workflow SHALL emit credential-free structured evidence for git synchronization, deployment queue resolution, rollout completion, and external health verification.

#### Scenario: Healthy release
- **WHEN** the application becomes `running:healthy` and its public health endpoint responds successfully
- **THEN** the helper SHALL record successful rollout and health-verification phase durations

#### Scenario: Failed release
- **WHEN** the observed deployment reaches a terminal failure state or exceeds its bounded observation window
- **THEN** the helper SHALL record the failed phase and preserve the application-safe fallback behavior without modifying application source code
