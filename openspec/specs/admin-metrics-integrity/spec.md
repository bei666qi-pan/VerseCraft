## Purpose

Protect the correctness and compatibility of daily web-traffic metrics.

## Requirements

### Requirement: Daily metric calculation has regression coverage

The system SHALL maintain automated tests for daily aggregation calculations covering numeric normalization, Asia/Shanghai date boundaries, visitor de-duplication, idempotent rebuild writes, source classification, and invalid identifiers for all web-traffic fields.

#### Scenario: Invalid visitor identifiers are excluded from UV

- **WHEN** a page-view event has a missing, blank, or malformed visitor identifier
- **THEN** it contributes to page views and any source-category PV but not to unique visitors

#### Scenario: Events on adjacent Beijing dates remain isolated

- **WHEN** page-view events occur immediately before and after a Beijing midnight boundary
- **THEN** rebuilding or querying either date includes only that date's event totals

### Requirement: Daily aggregate changes preserve existing analytics compatibility

The system SHALL add daily traffic fields through backward-compatible schema migration and continue to calculate existing daily activity, token, feedback, and completion metrics from their current authoritative sources.

#### Scenario: Existing daily metrics remain populated

- **WHEN** a daily rebuild includes web-traffic events and existing gameplay analytics events
- **THEN** the rebuilt row contains both the correct traffic totals and the correct pre-existing daily metrics

### Requirement: Overview uses a consistent authoritative traffic calculation

The system SHALL calculate overview traffic totals and source distribution from the same append-only page-view event set, using the same valid visitorId rule as request validation and the same Beijing-day boundary. It MUST NOT present a stale daily aggregate as the current authoritative total.

#### Scenario: Invalid historic visitor identifier

- **WHEN** a stored page-view event has a blank or malformed visitorId payload
- **THEN** it SHALL contribute to PV and its source category but SHALL NOT contribute to UV in either the daily rebuild or the overview

#### Scenario: Daily rebuild has not yet run

- **WHEN** a valid current-day page-view event exists after the most recent `web_traffic_daily` rebuild
- **THEN** the authenticated overview SHALL include that event in traffic totals and source distribution
