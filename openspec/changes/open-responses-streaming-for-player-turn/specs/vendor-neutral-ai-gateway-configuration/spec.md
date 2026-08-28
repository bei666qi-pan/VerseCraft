## ADDED Requirements

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
