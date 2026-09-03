---
status: accepted
---

# Do not cache authoritative online turn responses

An online response cache can return narrative and FINAL before Writer or
Mechanics, validation, commit and the asynchronous Director enqueue path run.
That creates a second turn authority, risks replaying state against the wrong
session, and makes usage and latency evidence incomparable.

VerseCraft therefore does not cache complete Player Turn responses. Knowledge
retrieval may cache non-authoritative facts and embeddings internally, but every
player request still enters `PlayerTurnWorkflow` and reaches the sole
`TurnFinalizer`. The retired `vc_semantic_cache` contained only generated
response data, had no surviving reader or writer, and is removed by the forward
migration. Migration history remains intact.
