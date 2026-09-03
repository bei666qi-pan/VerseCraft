# Design

The canonical flow is `PlayerTurnWorkflow → Writer|MechanicsWorkflow → TurnFinalizer → FINAL → WorldDirectorWorkflow`.

- PlayerTurnWorkflow owns lane selection, invocation budgets and exactly-once finalization behind one Interface.
- MechanicsWorkflow uses the shared bounded Agent Runtime and returns a Turn Candidate plus Mechanics Receipts.
- ChapterPacingController owns deterministic presentation progress only; the server event agenda is the sole future-event authority.
- WorldDirectorWorkflow consumes a Committed Turn Receipt and makes at most one model invocation. Actor context is deterministic input; validation is subtractive and deterministic.
- Durable Director state and event agenda are authoritative. Duplicate snapshots and stored prompt projections are migrated away after read-equivalence checks.
- Legacy saves are read through a one-way migration Adapter and are never written in the old shape.

Rollback disables new background planning and reverts callers to no-directive fail-open behavior. Additive migrations remain until zero-reader verification permits their later removal.
