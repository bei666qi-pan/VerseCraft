## Purpose

Provide a consistent daily free-token allowance and an exact player-visible refresh time for both guests and registered users.

## Requirements

### Requirement: Daily quota uses the established date key consistently
The system SHALL calculate registered-user and guest token availability against the established UTC daily key, so a record from an earlier key MUST NOT consume the new day's allowance.

#### Scenario: Registered user crosses the daily boundary
- **WHEN** a registered user's stored quota record belongs to a prior daily key
- **THEN** the quota check SHALL report zero tokens used for the new key before evaluating the next action.

#### Scenario: Guest crosses the daily boundary
- **WHEN** a guest's `actor_daily_tokens` record belongs to a prior daily key
- **THEN** the quota check SHALL exclude that record from the guest's new daily allowance.

### Requirement: Quota denial names the exact refresh time
The system SHALL include the next quota refresh instant in every token-limit or action-limit player-facing denial, formatted as a precise Beijing-time timestamp. Ban denials MUST NOT claim an automatic refresh.

#### Scenario: Guest token quota is exhausted
- **WHEN** a guest action exceeds the current daily token allowance
- **THEN** the SSE final narrative SHALL state the guest quota limit and the exact next refresh time.

#### Scenario: Registered action count is exhausted
- **WHEN** a registered user's action would exceed the daily action allowance
- **THEN** the SSE final narrative SHALL state the exact next refresh time without changing the SSE envelope or required DM JSON keys.
