## ADDED Requirements

### Requirement: Administrators manage encrypted AI services and models
The system SHALL let an authenticated administrator create, edit, test, enable, disable, and soft-delete AI services and their models. API keys MUST be encrypted at rest, MUST never be returned after submission, and MUST be represented only by a non-sensitive last-four hint.

#### Scenario: Key is replaced successfully
- **WHEN** an administrator submits a changed key and every changed model passes a bounded connection test
- **THEN** the system atomically stores the encrypted replacement, increments the configuration version, returns only the last-four hint, and records a secret-free audit event

#### Scenario: Candidate connection test fails
- **WHEN** a new address, key, or model fails validation or its bounded live test
- **THEN** the system leaves the active configuration unchanged and returns a plain-language error without response content or credentials

### Requirement: AI service addresses are protected from server-side request forgery
The system MUST allow production connections only to HTTPS destinations whose resolved addresses are public, MUST reject URL credentials and restricted IP ranges, and MUST revalidate every redirect destination.

#### Scenario: Restricted destination is submitted
- **WHEN** an administrator submits a loopback, private, link-local, metadata, credential-bearing, or DNS-rebinding destination
- **THEN** the system rejects it before sending an authenticated request

### Requirement: Purpose routes have ordered primary and fallback models
The system SHALL maintain an ordered model list for story generation, rule decisions, prose polish, background reasoning, and knowledge retrieval. It SHALL allow immediate service disablement and SHALL omit disabled or deleted entries from new request snapshots.

#### Scenario: Primary service fails authentication
- **WHEN** a purpose's primary service returns an authentication failure and a healthy fallback exists
- **THEN** the current request skips the failed service, attempts the fallback, and exposes a non-sensitive operational warning

#### Scenario: Service is disabled without replacement
- **WHEN** an administrator disables the last active model for a purpose
- **THEN** new requests for that purpose fail or degrade explicitly while historic usage retains the service and model snapshots

### Requirement: Runtime configuration hot reload is bounded and request-stable
The system SHALL resolve real AI configuration from PostgreSQL into an immutable process snapshot, SHALL propagate version invalidation across instances, and SHALL make committed changes visible to new requests within five seconds. A request MUST retain its starting snapshot until it finishes.

#### Scenario: Configuration changes during a turn
- **WHEN** an administrator activates a tested replacement while a player turn is streaming
- **THEN** the active turn completes with its original binding and a subsequent turn uses the new version within five seconds

