## Why

Live self-improvement traces show conclusive gameplay failures where legal exploration turns reach the authoritative final frame without executable options, while an action using an explicitly nonexistent key is accepted and narratively materializes the item. These outcomes can soft-lock ordinary play and violate inventory conservation even though the requests complete successfully.

## What Changes

- Add regression coverage for legal, non-terminal DM turns whose candidate output omits options.
- Guarantee executable fallback options during the production finalization path for legal, non-terminal gameplay turns.
- Add regression coverage for actions that explicitly claim use of an item absent from authoritative inventory state.
- Reject or safely degrade phantom-item actions before their candidate narrative/state changes can become authoritative.
- Preserve dialogue intent when an action approaches an NPC in order to speak, instead of rejecting it as unresolved world movement.
- Return an SSE-compatible, non-consuming rejection for empty player input without invoking the model.
- Preserve the existing SSE envelope, final-frame override semantics, expectations, thresholds, holdouts, and self-improvement infrastructure.

## Capabilities

### New Capabilities

- `turn-playability-guards`: Defines production guarantees for executable legal turns and inventory-grounded item actions.

### Modified Capabilities

None.

## Impact

The change affects production turn normalization/guard code, validation-response handling, and focused unit or contract tests. It may touch `/api/chat` finalization wiring but does not change the SSE/DM JSON shape, analytics events, database schema, client store, hydration, AI routing, or prompt contract. The finalization guards run after candidate generation; dialogue-intent precedence and empty-input rejection are deterministic pre-model checks with no network or database work.
