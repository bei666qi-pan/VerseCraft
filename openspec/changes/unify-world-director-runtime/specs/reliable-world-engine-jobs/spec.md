## ADDED Requirements

### Requirement: World engine tick V2 SHALL carry explicit bounded scope and signals
New tick jobs MUST carry a versioned V2 payload containing `worldId`, `mapId`, `sessionId`, `turnIndex`, `dedupKey`, player locations before/after, present/dead NPC IDs, changed task/clue IDs, bounded pacing/chapter/world summaries, and the latest structured turn signals. Full prompts, full narratives, and unfiltered player text MUST NOT be stored or logged.

#### Scenario: New payload omits map identity
- **WHEN** a V2 tick payload omits `mapId`
- **THEN** enqueue or worker validation rejects it without inferring a map from content

#### Scenario: Fully legacy payload has no scope
- **WHEN** a pre-V2 persisted job contains neither world nor map identity
- **THEN** migration maps it to the canonical Dark Moon scope only

### Requirement: PostgreSQL SHALL be the job deduplication authority
`vc_jobs` SHALL store an idempotency key with uniqueness over job type and key. `enqueueWorldEngineTick` SHALL return a truthful `{ enqueued, jobId, dedupKey }` result and MUST NOT report success when the database did not persist or identify a job.

#### Scenario: Database insertion fails
- **WHEN** PostgreSQL cannot insert or resolve the tick job
- **THEN** enqueue returns `enqueued: false` without a fabricated job ID

#### Scenario: Duplicate tick is enqueued
- **WHEN** two requests use the same world tick idempotency key
- **THEN** PostgreSQL contains one job and both callers can identify that job

### Requirement: Director runs SHALL be recoverable and transactionally committed
The worker SHALL establish a scoped run in `running`, reuse an existing succeeded dedup run, and return non-zero `runId` and `worldRevision` for success. Agenda, Director state, social deltas, and hint envelope MUST commit in one transaction or all roll back.

#### Scenario: Retry observes succeeded run
- **WHEN** a duplicate worker execution finds a succeeded run for the same scope and dedup key
- **THEN** it returns the existing non-zero run and revision without re-running world evolution

#### Scenario: Hint write fails inside output transaction
- **WHEN** persistence fails after agenda changes but before hint completion
- **THEN** agenda, state, social deltas, and hint changes are all rolled back

### Requirement: Legacy Director data SHALL migrate additively to Dark Moon
Migration SHALL add nullable scope columns, backfill legacy Director rows/jobs to Dark Moon, create compound indexes, verify no null scope, then tighten constraints and stop legacy queries. Disabling features MUST retain the additive schema.

#### Scenario: Existing session-only rows are migrated
- **WHEN** the scope backfill runs against pre-multi-world Director data
- **THEN** each row receives the canonical Dark Moon world and map IDs without content-based inference
