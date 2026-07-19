## ADDED Requirements

### Requirement: Bounded narrative action parsing is audit-only

When a candidate DM record contains a supported, deterministic narrative action, the post-generation validator MUST invoke the resolver with the existing structured currency delta and MAY expose its summary as telemetry. The resolver MUST NOT write awards, consumption, currency, task, profession, or director fields into the candidate record or persistent game state.

#### Scenario: Supported acquire action has no candidate award

- **WHEN** a candidate narrative contains a resolver-supported acquisition and its award arrays are empty
- **THEN** validation MUST expose a bounded audit signal and MUST retain empty award arrays

#### Scenario: Candidate already contains authoritative action data

- **WHEN** a candidate narrative contains an action but its corresponding structured award, consumption, or currency field is already present
- **THEN** validation MUST preserve the existing structured value and MUST NOT replace it with narrative-derived data

### Requirement: Action-backfill failure remains conservative

The system MUST treat a resolver failure as no backfill and MUST NOT invent inventory, currency, task, profession, or director state from the narrative.

#### Scenario: Resolver cannot safely produce a result

- **WHEN** the resolver returns no supported action result or throws during validation
- **THEN** the candidate record MUST retain its existing structured state fields and downstream guards MUST remain able to reject inconsistent prose
