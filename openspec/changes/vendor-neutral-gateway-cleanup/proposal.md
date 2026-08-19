## Why

The repository retains obsolete provider-specific information in local AI configuration, local tool permissions, and source metadata. Removing it now prevents a generic OpenAI-compatible gateway from implying an unwanted vendor association.

## What Changes

- Remove obsolete provider identifiers, endpoints, comments, and local tool-permission entries from the repository, including ignored local configuration files.
- Preserve the vendor-neutral OpenAI-compatible gateway configuration contract without supplying a replacement endpoint or credentials.
- Add a repository-wide verification guard that scans project files for the removed identity markers while excluding dependency and build-output directories.

## Capabilities

### New Capabilities

- `vendor-neutral-ai-gateway-configuration`: AI gateway configuration and related source metadata contain no retired provider identity while continuing to support a generic OpenAI-compatible gateway.

### Modified Capabilities

- None.

## Impact

- Affected local configuration and local tool-permission metadata, plus an AI-provider type comment.
- No changes to `/api/chat`, SSE/DM JSON, state, database schema, authentication, analytics events, dependencies, or public APIs.
- No prompt, validator, gateway request-path, or performance-budget behavior changes; existing missing-gateway degradation remains unchanged.
- Scope excludes replacement provider setup, credential rotation outside the repository, and the separately blocked evaluation-evidence cleanup.
