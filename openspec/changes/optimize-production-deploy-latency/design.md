## Context

The production image currently installs dependencies twice from scratch and performs a full build for every release. The most recent release showed approximately 6m15s for each dependency layer before application compilation and rollout. In the same release, `deploy-selfheal` received a deployment UUID that did not resolve through the expected endpoint, interpreted the missing status as failure, and created duplicate queued deployments.

## Goals / Non-Goals

**Goals:**

- Reuse a stable pnpm package-store cache across Docker builds without embedding credentials or making the final image larger.
- Keep a fast path for source-only changes and retain a bounded domestic-registry fallback for cache misses.
- Resolve and monitor one real Coolify deployment per trigger, and report its queued, active, failed, or healthy outcome accurately.
- Produce machine-readable phase timings so later work can compare releases against a real baseline.

**Non-Goals:**

- Change application behavior, the turn engine, data schema, AI routing, or runtime dependencies unrelated to deployment.
- Disable health checks, force an unsafe in-place replacement, or remove the production dependency isolation that caught the worker issue.
- Depend on a particular Coolify API minor version without a safe collection-query fallback.

## Decisions

### Cache the pnpm store, not `node_modules`

The Dockerfile will use BuildKit cache mounts when available to persist the pnpm store. The `pnpm install --frozen-lockfile` steps remain authoritative, so the lockfile controls correctness and source-only changes can reuse downloaded packages. The existing timeout and secondary domestic registry remain the cache-miss fallback. Copying `node_modules` from a prior image is rejected because native modules and pnpm symlinks can become stale across lockfile and platform changes.

### Separate deployment observation from retry policy

The Coolify client will locate a deployment by first querying the UUID endpoint and, if that endpoint is unavailable or returns a non-status payload, by matching the deployment UUID in the active deployments collection. The monitor treats a known queued or active record as progress, not a retry condition. Retry policy only runs after a terminal failed state or a bounded timeout with no matching record. This prevents status API compatibility problems from creating duplicate release jobs.

### Emit phase telemetry without new infrastructure

The deploy helper will log structured phase duration records locally: Git sync, deployment queue resolution, active build/rollout, and external health verification. The records contain no credential values and do not change analytics or database contracts. This is preferred to adding a production service merely for deployment metrics.

## Risks / Trade-offs

- [BuildKit cache mount unavailable on an older builder] → The Dockerfile retains ordinary `pnpm install` behavior and registry fallback; cache optimization degrades without breaking the build.
- [Stale cache conceals a package resolution problem] → `--frozen-lockfile` stays mandatory and `--forceRebuild` remains available for a clean recovery build.
- [Coolify collection format differs] → Accept array, `data`, and `deployments` envelopes; retain direct endpoint polling as the first path and test all normalized shapes.
- [Queued duplicate work already exists] → Do not rely on cancellation endpoints; a healthy running revision remains safe while queued jobs naturally resolve.

## Migration Plan

1. Add focused unit tests for deployment normalization, terminal state handling, and duplicate-trigger prevention.
2. Update Dockerfile and deployment client/helper, then run lint, focused tests, and a Docker build.
3. Ship through the normal PR → GitHub → Gitee → Coolify flow and compare logged phase timings with the current baseline.
4. Roll back by reverting the PR. The prior Dockerfile and direct polling behavior remain compatible with the existing app configuration.

## Open Questions

- Whether the production Coolify builder has BuildKit cache mounts enabled will be verified by the next release log; no platform configuration change is assumed by this change.
