---
status: accepted
---

# Converge Director storage and migrate legacy saves on read

The authoritative Director agenda is `world_engine_event_queue`, scoped by
`worldId + mapId + sessionId`. `social_event_ledger` remains a separate domain
ledger. `server_director_state`, `world_engine_agenda_snapshots` and
`world_engine_hint_envelopes` have no surviving runtime reader or writer and are
removed by a forward migration together with the five confirmed obsolete
statistics tables.

Old saves may still contain `storyDirector` and `incidentQueue`. The save
normalizer reads them once, projects bounded progress, tension and identifiers
into `ChapterPacingStateV2`, and writes only the new structure afterward. Free
text client direction is never promoted into a server plan or Writer prompt.

The migration is intentionally additive-before-subtractive: deploy the reader
and projection first, validate old-save fixtures and dual-read equivalence,
then stop legacy writes and drop unused tables without `CASCADE`. Rollback uses
the pre-cleanup database backup and the prior application image; application
rollback alone cannot recreate dropped data.
