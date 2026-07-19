## ADDED Requirements

### Requirement: Capture privacy-minimized page views
The system SHALL record one best-effort `page_viewed` analytics event for each eligible client-side page entry while web traffic analytics is enabled. The event MUST contain only a normalized pathname, server-assigned event time, platform classification, and a stable anonymous browser `visitorId`; it MUST NOT include query strings, fragments, raw IP address, or raw user-agent text.

#### Scenario: Public page entry is recorded
- **WHEN** a visitor enters an eligible public pathname while `VERSECRAFT_ENABLE_WEB_TRAFFIC_ANALYTICS` is enabled
- **THEN** the system records one idempotent `page_viewed` event with that pathname and anonymous visitor ID

#### Scenario: Feature flag disables collection
- **WHEN** `VERSECRAFT_ENABLE_WEB_TRAFFIC_ANALYTICS` is disabled
- **THEN** the collection endpoint returns a successful skipped response and no `page_viewed` event is written

### Requirement: Build daily web traffic aggregates
The daily rebuild workflow SHALL calculate each Asia/Shanghai calendar date's page views as the count of `page_viewed` events and unique visitors as the count of distinct non-empty event visitor IDs, then fully overwrite that date's corresponding web-traffic aggregate fields.

#### Scenario: Rebuild deduplicates visitor traffic
- **WHEN** a Beijing calendar day contains multiple page-view events from one visitor and events from a second visitor
- **THEN** the daily aggregate stores all events as page views and exactly two unique visitors

#### Scenario: Rebuild is idempotent
- **WHEN** the rebuild workflow is run more than once for the same Beijing calendar date without event changes
- **THEN** the stored page-view and unique-visitor totals remain unchanged

### Requirement: Expose daily web traffic in the admin overview
The authenticated admin overview SHALL expose current and previous Beijing-day page-view and unique-visitor KPI values from the daily aggregate with a source and definition that state the product-event and Asia/Shanghai-day semantics.

#### Scenario: Dashboard shows day-over-day web traffic
- **WHEN** an authenticated administrator loads the overview after daily aggregates are available
- **THEN** the response includes page-view and unique-visitor KPIs with the immediately preceding Beijing-day values as their comparison baseline
