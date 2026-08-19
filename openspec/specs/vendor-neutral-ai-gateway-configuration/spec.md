# Vendor-neutral AI Gateway Configuration

## Purpose

Keep generic OpenAI-compatible gateway support free of retired provider identity markers.

## Requirements

### Requirement: Retired provider identity removal
The repository SHALL contain no retired-provider identity markers in application source, repository-local configuration, local tool permissions, file names, or active change artifacts. Generic OpenAI-compatible gateway support MUST remain vendor-neutral.

#### Scenario: Repository identity scan is clean
- **WHEN** the bounded case-insensitive cleanup scan runs over tracked and ignored project files
- **THEN** it reports no retired-provider identity markers and does not scan dependency, VCS, build, coverage, or test-result directories

#### Scenario: Generic gateway remains unconfigured
- **WHEN** no generic gateway endpoint is configured locally
- **THEN** the existing missing-gateway behavior remains available without a provider-specific fallback

### Requirement: Sensitive cleanup verification
Cleanup verification SHALL not print credential values or full sensitive configuration lines.

#### Scenario: A match is found during verification
- **WHEN** the verification scan finds a prohibited marker
- **THEN** it reports only the affected path and does not print the matching line content
