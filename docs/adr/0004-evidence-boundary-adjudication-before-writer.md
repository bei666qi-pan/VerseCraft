---
status: accepted
---

# Adjudicate explicit negative evidence before Writer

Some player actions are already impossible from the submitted structured
snapshot: a described person is explicitly absent, an NPC is explicitly barred
from knowing a requested fact, a claimed relationship has no registered fact,
or an acquired item is absent from the registered item set. Sending these
actions to Writer adds latency and cost while asking a model to rediscover a
code-owned invariant.

`PlayerTurnWorkflow` therefore runs one narrow deterministic adjudicator after
input safety and before retrieval or model work. It may match only when the
request supplies explicit structured negative evidence. It returns a bounded
explanation and contextual options with zero model calls and zero state delta.
Ambiguous descriptions, missing evidence and registered facts continue through
Writer or Mechanics.

These responses reject a non-committing action: they do not create a
`CommittedTurnReceipt` or schedule World Director work, so they do not form a
second commit authority. The Turn Engine still emits exactly one FINAL. A
FINAL-only response counts as concrete player-visible narrative for the
eight-second hard latency gate, and its options must be available within the
five-second ceiling.
