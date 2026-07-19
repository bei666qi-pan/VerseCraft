## ADDED Requirements

### Requirement: Daily metric calculation has regression coverage
The system SHALL maintain automated tests for daily aggregation calculations covering numeric normalization, Asia/Shanghai date boundaries, visitor de-duplication, and idempotent rebuild writes for all newly added web-traffic fields.

#### Scenario: Invalid visitor identifiers are excluded from UV
- **WHEN** a page-view event has a missing or blank visitor identifier
- **THEN** it contributes to page views but not to unique visitors

#### Scenario: Events on adjacent Beijing dates remain isolated
- **WHEN** page-view events occur immediately before and after a Beijing midnight boundary
- **THEN** rebuilding either date includes only that date's event totals

### Requirement: Daily aggregate changes preserve existing analytics compatibility
The system SHALL add daily traffic fields through backward-compatible schema migration and continue to calculate existing daily activity, token, feedback, and completion metrics from their current authoritative sources.

#### Scenario: Existing daily metrics remain populated
- **WHEN** a daily rebuild includes web-traffic events and existing gameplay analytics events
- **THEN** the rebuilt row contains both the correct traffic totals and the correct pre-existing daily metrics
