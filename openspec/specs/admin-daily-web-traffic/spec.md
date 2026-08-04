## Purpose

Define the privacy-minimized page-traffic telemetry and its Beijing-day presentation in the authenticated admin overview.

## Requirements

### Requirement: Capture privacy-minimized page views

The system SHALL record one best-effort `page_viewed` analytics event for each eligible client-side page entry while web traffic analytics is enabled. The event MUST contain only a normalized pathname, server-assigned event time, platform classification, a stable anonymous browser `visitorId`, and one source category; it MUST NOT include query strings, fragments, raw IP address, raw user-agent text, raw referrer URL, referrer host, search query, or UTM value.

#### Scenario: Public page entry is recorded

- **WHEN** a visitor enters an eligible public pathname while `VERSECRAFT_ENABLE_WEB_TRAFFIC_ANALYTICS` is enabled
- **THEN** the system records one idempotent `page_viewed` event with that pathname, anonymous visitor ID, and source category

#### Scenario: Feature flag disables collection

- **WHEN** `VERSECRAFT_ENABLE_WEB_TRAFFIC_ANALYTICS` is disabled
- **THEN** the collection endpoint returns a successful skipped response and no `page_viewed` event is written

### Requirement: Classify privacy-minimized traffic sources

The system SHALL classify each eligible page view into exactly one privacy-minimized source category: `direct`, `internal`, `search`, `social`, or `referral`. It SHALL persist only that category, never the raw source.

#### Scenario: External search visit

- **WHEN** an eligible page entry has a recognized search-engine referrer
- **THEN** the page-view event SHALL store only the `search` source category

#### Scenario: No referrer is available

- **WHEN** an eligible page entry has no referrer
- **THEN** the page-view event SHALL store the `direct` source category without adding raw source data

### Requirement: Build daily web traffic aggregates

The daily rebuild workflow SHALL calculate each Asia/Shanghai calendar date's page views as the count of `page_viewed` events and unique visitors as the count of distinct valid event visitor IDs, then fully overwrite that date's corresponding web-traffic aggregate fields.

#### Scenario: Rebuild deduplicates visitor traffic

- **WHEN** a Beijing calendar day contains multiple page-view events from one visitor and events from a second visitor
- **THEN** the daily aggregate stores all events as page views and exactly two unique visitors

#### Scenario: Rebuild is idempotent

- **WHEN** the rebuild workflow is run more than once for the same Beijing calendar date without event changes
- **THEN** the stored page-view and unique-visitor totals remain unchanged

### Requirement: Expose daily web traffic in the admin overview

The authenticated admin overview SHALL expose current and previous Beijing-day page-view and unique-visitor KPI values from the append-only page-view event set, with a source and definition that state the product-event and Asia/Shanghai-day semantics. It SHALL expose the current Beijing-day source distribution in plain language.

#### Scenario: Dashboard shows day-over-day web traffic

- **WHEN** an authenticated administrator loads the overview
- **THEN** the response includes page-view and unique-visitor KPIs with the immediately preceding Beijing-day values as their comparison baseline

#### Scenario: Sources are understandable without exposing raw referrers

- **WHEN** an authenticated administrator views current-day traffic
- **THEN** the dashboard shows the five source categories with plain-language descriptions and states that raw referrer data is not stored
