## Context

The live traces are conclusive: successful `/api/chat` requests produced parsed authoritative DM payloads with either empty `options` on legal exploration turns or a successful narrative for an explicitly nonexistent key. Because model output is only a candidate, deterministic production finalization must enforce both playability and inventory conservation before emitting `__VERSECRAFT_FINAL__`.

## Goals / Non-Goals

**Goals:**

- Preserve executable choices on legal, non-terminal turns even when the candidate model payload omits them.
- Prevent an explicitly absent player item from becoming real through narrative or state deltas.
- Prevent approach-to-talk actions from being treated as unresolved location traversal.
- Reject empty input before model execution while preserving an SSE final frame for realtime consumers.
- Cover the observed behavior with failing production-level regression tests before implementation.
- Keep guards deterministic, local, and outside the first-token path.

**Non-Goals:**

- Changing self-improvement scenarios, expectations, thresholds, holdouts, or verifier behavior.
- Adding case-ID-specific branches or teaching eval infrastructure to ignore failures.
- Changing the SSE envelope, DM JSON schema, prompts, model routing, state store, schema, or analytics.
- Changing NPC presence or epistemic rules beyond intent precedence for explicit dialogue actions.

## Decisions

1. Enforce options in production finalization, not in the evaluator or by lengthening the prompt. A deterministic fallback based on the current action/context survives model variance and protects every consumer of the authoritative final frame. Prompt-only reinforcement was rejected because the observed model already violated an existing structured-output expectation.
2. Ground item-use adjudication in authoritative request inventory and explicit absence semantics. When a player action itself identifies an item as never owned/absent, the finalizer must reject the action and strip any candidate item deltas rather than allowing narrative invention. A generic case-ID check is forbidden and would not protect real gameplay.
3. Keep both checks in pure production helpers exercised through the same finalization entry points used by `/api/chat`. This permits focused unit regression coverage without live network dependence and adds negligible post-generation cost.
4. Preserve valid terminal/refusal behavior. Options are only backfilled for legal, non-terminal ordinary gameplay turns; death and intentionally illegal actions are not forced to offer choices.
5. Treat an explicit dialogue indicator as dominant over the incidental approach verb in phrases such as “走向陈婆婆，想和他聊聊”. The authored-location guard must not require a graph edge unless the action is actually requesting traversal.
6. Keep validation strict, but translate an empty-input validation failure into the existing SSE final envelope with HTTP 200, `is_action_legal: false`, and `consumes_time: false`. This avoids model work and prevents the realtime wrapper from misclassifying a deliberate rejection as a site failure.

## Risks / Trade-offs

- [Risk] Generic fallback options may be less tailored than model-generated choices. → Reuse existing contextual option fallback machinery where available and only activate it when candidate options are unusable.
- [Risk] Natural-language item detection may over-reject metaphorical mentions. → Limit the guard to explicit item-use claims paired with authoritative absence indicators; keep the helper conservative and regression-test both rejection and ordinary exploration.
- [Risk] Existing uncommitted edits overlap the route and normalizer. → Make the smallest isolated helper/wiring changes and preserve all unrelated worktree modifications.
- [Risk] A finalization guard could add latency. → Use only bounded string/array checks after generation; no IO, LLM, retries, or retrieval.
- [Risk] Dialogue precedence could suppress a genuine move-and-talk request. → Only suppress movement adjudication when explicit speaking/chatting language is present; the model may still narrate an approach without committing a location delta.
- [Risk] Returning HTTP 200 for empty input differs from a conventional REST validation response. → Preserve rejection in the authoritative DM payload and use the repository's realtime SSE contract, which clients already parse as the source of truth.

## Migration Plan

No data migration is required. Deploy as a deterministic finalization correction; rollback consists of reverting the isolated helper/wiring change. Existing saves and DM payload consumers remain compatible.

## Open Questions

None; the exact production hook will be selected after tracing current finalization and existing option/item guard helpers.
