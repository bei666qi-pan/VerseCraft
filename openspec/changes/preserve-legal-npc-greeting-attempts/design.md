## Context

The original live final envelope for `走过去和林晚枫打个招呼。（再试一次）` was structurally valid and arrived in 6.3 seconds, but the candidate marked the action illegal because the named person could not be found. Follow-up live runs also completed normally with parsed SSE final frames: one described the target as no longer visible, while another had its contaminated narrative safely emptied by the protocol guard. Existing finalization already reapplies `applyRegisteredMechanicsGuard` after protocol sanitization, commit, and output audit, making that pure production guard the narrowest authoritative correction point.

## Goals / Non-Goals

**Goals:**

- Treat a harmless physical attempt to approach and greet or converse as legal even if contact cannot be made.
- Preserve the generated no-contact consequence instead of creating the named NPC.
- Strip entity/state mutations that could accidentally establish an absent target.
- Cover the exact `golden-talk-to-npc`, `golden-talk-to-npc-npcswap-3`, `golden-talk-to-npc-var-2`, `golden-talk-to-npc-var-2-npcswap-3`, `golden-talk-to-npc-repeat-3`, `golden-talk-to-npc-var-2-var-3`, `keepalive-normal-talk-var-2`, `keepalive-normal-talk-var-2-repeat-3`, `keepalive-normal-talk-var-3`, `keepalive-normal-talk-repeat-3`, and `keepalive-normal-talk-var-2-var-3` live final shapes with failing-then-passing unit regressions.

**Non-Goals:**

- Do not alter eval infrastructure, strict gates, thresholds, prompts, or holdouts.
- Do not make coercion, combat, forced affection, mind control, or other prohibited acts legal.
- Do not register new NPCs or change the SSE/DM JSON contract.

## Decisions

1. Add a narrow, deterministic intent predicate inside the existing registered mechanics final guard. It requires both an approach cue and an ordinary greeting/conversation cue, and rejects coercive or violent cues. This is more reliable and cheaper than expanding the stable prompt.
2. Only override a false candidate when its narrative describes failure to locate/reach the target, including the target disappearing before contact, or when `security_meta` proves the narrative alone was degraded by the final protocol guard. This keeps the correction tied to observed non-gameplay failure modes rather than independent rule violations.
3. On correction, set `is_action_legal: true`, preserve a usable no-contact narrative, and clear NPC/entity mutation fields (`relationship_updates`, NPC codex awards, NPC location updates, tasks or rewards are already independently guarded). If protocol sanitization left the narrative empty, provide a fixed no-contact fallback rather than reconstructing model prose. Add a commit flag for observability without changing analytics taxonomy.
4. Run the rule in `applyRegisteredMechanicsGuard`, which is reapplied after audit and before final serialization. The rule performs no I/O and does not affect first token or gateway latency.
5. Recognize direct ordinary-contact phrasing such as `向某人了解情况`, and compare the named action target with explicit absence or wrong-person prose such as `没有某人` and `不是某人`; this remains narrower than treating every illegal dialogue turn as legal.
6. Recognize an approach followed by an anaphoric conversation cue such as `走向林晚枫，想和他聊聊`, plus an explicit denial such as `没这人`; both still require the harmless-contact predicate and continue to exclude coercive or violent actions.
7. Treat an explicit redacted denial such as `没有叫陌生人枫的人` as an unavailable-contact outcome. When entity governance has already replaced the candidate prose, accept the fallback only when the existing audit tuple proves `safe_fallback: true`, `decision: block_commit`, and `entity_hard_gate: true`; do not infer this state from generic fallback prose alone.
8. Treat the equivalent empty-contact wording `什么都没有` and explicit inability-to-contact wording such as `上哪儿再次确认` or `找谁问都摸不着门` as failed but legal ordinary contact attempts. These outcomes still require the narrow harmless-contact input predicate.

## Risks / Trade-offs

- [Regex intent classification could overmatch a genuinely prohibited social request] → Require explicit ordinary greeting/conversation language, exclude coercion/violence, and require a no-contact narrative reason.
- [Setting legality true could accidentally retain invented NPC state] → Remove relationship and NPC-location deltas and filter NPC codex updates when the correction applies.
- [Narrative may still mention the unregistered name] → Existing post-generation name audit/redaction remains authoritative and unchanged.
- [A protocol-degraded candidate may contain untrusted state deltas] → The contact correction remains after existing commit/audit guards and clears target-specific state; it does not restore sanitized prose or bypass protocol flags.

## Migration Plan

No data migration is required. Deploy with the existing final guard; rollback is removal of the narrow predicate and correction branch.

## Open Questions

None.
