## Why

The latest production release spent more than six minutes downloading dependencies per image layer and generated duplicate Coolify deployments because the local deployment monitor could not reliably resolve the platform's active deployment record. This lengthens the window between a validated main commit and a healthy production instance, while making operational status harder to trust.

## What Changes

- Make Docker dependency layers reusable across source-only releases without copying the full workspace before dependency installation.
- Add explicit, bounded cache and registry fallback behavior for domestic production builders, with observable timings for dependency, application-build, and rollout phases.
- Make the Coolify client resolve the actual active deployment using the deployments collection when the per-deployment endpoint is unavailable, so one release triggers and monitors one deployment rather than generating redundant retries.
- Preserve non-forced deployment as the default and expose forced clean rebuild only as an explicit recovery option.

## Capabilities

### New Capabilities

- `production-deployment-latency`: Builds, publishes, and observes a production release with deterministic cache keys, bounded fallback, and a single authoritative Coolify deployment monitor.

### Modified Capabilities

- None.

## Impact

- Affects `Dockerfile`, deployment scripts under `scripts/autoops/`, `deploy.sh`, and deployment-focused tests and documentation.
- Does not change `/api/chat` SSE/JSON, game state, analytics events, database schema, prompt routing, or the online turn latency budget.
- Docker and Coolify behavior retain safe fallbacks: cache misses use the existing registry fallback, deployment monitor failures do not alter application code, and a clean rebuild remains opt-in.
