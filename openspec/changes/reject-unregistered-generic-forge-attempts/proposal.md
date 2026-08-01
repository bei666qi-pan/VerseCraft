## Why

The live deterministic case `boundary-forge-insufficient-materials-qty-3` sent a generic request to forge an unregistered sword without structured forge state. It bypassed the deterministic service lane, and the upstream stream ended without a `__VERSECRAFT_FINAL__` frame. A generic unregistered forge attempt can be adjudicated from structured state without a model call: it must not create an item or consume materials.

## What Changes

- Add a narrow deterministic production path for explicit generic weapon-forging attempts that do not name a registered recipe.
- Return a normal final DM envelope that rejects the unregistered operation without consuming resources or awarding items.
- Add a failing-then-passing regression for the exact `boundary-forge-insufficient-materials-qty-3` action.
- Preserve the existing registered B1 forge execution and quote paths.

## Capabilities

### Modified Capabilities

- `turn-playability-guards`: Generic unregistered forging is deterministically rejected without state mutation.

## Impact

- Production code: `src/lib/playRealtime/deterministicServiceTurn.ts`.
- Tests: `src/lib/playRealtime/deterministicServiceTurn.test.ts`.
- `/api/chat`: no SSE shape change; the existing deterministic final-envelope branch handles this action before the model call.
- Performance: removes a model call for a fully adjudicable invalid operation.
- Non-goals: changing eval infrastructure, retry budgets, registered recipes, materials, or forge economics.
