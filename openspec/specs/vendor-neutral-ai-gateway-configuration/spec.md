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

### Requirement: Gateway selection SHALL honor the service `transport` field
The provider factory at `src/lib/ai/providers/index.ts` SHALL return `openaiResponsesGateway` when the active service `ai_service_connections.transport` is `openai_responses` and SHALL return `openaiCompatibleGateway` for every other transport, including `openai_compatible` and `ark_multimodal`. The `openai_responses` transport SHALL participate in `PLAYER_CHAT` routing with the same consumer contract as `openai_compatible` (SSE chunk shape, status frames, `__VERSECRAFT_FINAL__` envelope, DM JSON minimum fields), and SHALL preserve the §3.2.2 mutual exclusion between strict function tools and `text.format.json_schema` on a per-request basis.

#### Scenario: Service transport drives gateway choice
- **WHEN** a request is bound to a service whose `transport` is `openai_responses`
- **THEN** `getProviderFactory(transport)` returns `openaiResponsesGateway` and the request body is shaped for the Responses API

#### Scenario: Default transport still routes to openai_compatible
- **WHEN** a service has no `transport` recorded or `transport` is `openai_compatible` / `ark_multimodal`
- **THEN** `getProviderFactory` returns `openaiCompatibleGateway` and the existing Chat-Completions request body shape is preserved

#### Scenario: Responses transport does not break vendor neutrality
- **WHEN** the `openai_responses` transport is in use
- **THEN** the gateway emits only generic Responses-API field names (`model`, `input`, `stream`, `text`, `tools`, `tool_choice`, `stream_options`, `reasoning`) and SHALL NOT bake any specific vendor name into source, config, file names, or active change artifacts
