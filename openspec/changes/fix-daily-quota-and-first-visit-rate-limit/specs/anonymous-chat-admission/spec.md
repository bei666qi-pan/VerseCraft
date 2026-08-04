## ADDED Requirements

### Requirement: Anonymous browser chat rate-limit isolation
The system SHALL issue a server-managed anonymous browser identity on normal page responses and SHALL use it as the `/api/chat` rate-limit key fallback when a valid client fingerprint is absent. It MUST retain IP and user-agent dimensions and MUST retain the existing conservative fallback when neither identity is available.

#### Scenario: First action after an anonymous page visit
- **WHEN** an anonymous browser opens `/play` and then sends its first `/api/chat` request without a stable local-storage fingerprint
- **THEN** the request SHALL use its server-managed browser identity rather than sharing the generic IP-and-UA-only bucket.

#### Scenario: Identity feature is disabled
- **WHEN** `VERSECRAFT_ENABLE_ANONYMOUS_CHAT_LIMIT_IDENTITY` is disabled
- **THEN** `/api/chat` SHALL use the pre-existing fingerprint or IP-and-UA rate-limit key behavior.

### Requirement: Chat limit safety remains enforced
The system SHALL preserve the existing `/api/chat` request limit and SHALL return the existing 429 JSON shape only when the caller's resolved chat bucket is actually exhausted.

#### Scenario: Resolved browser bucket is exhausted
- **WHEN** a browser sends more chat requests than its permitted bucket interval
- **THEN** the middleware SHALL return HTTP 429 with `error` equal to `rate_limited`.
