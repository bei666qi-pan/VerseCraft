## Context

The application supports a generic OpenAI-compatible AI gateway through local configuration. Several repository-local metadata and configuration entries describe a retired provider directly. They are not required by the gateway interface and must be removed without changing runtime contracts.

## Goals / Non-Goals

**Goals:**

- Eliminate retired-provider identity markers from source, local configuration, local tool permissions, and change artifacts.
- Preserve empty or user-supplied generic gateway configuration semantics.
- Establish a repeatable scan that verifies both tracked and ignored project files are clean.

**Non-Goals:**

- Selecting, configuring, or testing another AI provider.
- Rotating external credentials or altering any remote system.
- Changing chat routing, prompts, SSE framing, state handling, analytics, database schema, or performance budgets.

## Decisions

### Remove values rather than substitute another provider

The retired endpoint and permission rule will be deleted, and the generic configuration key will be left unset. This avoids retaining an implicit deployment choice or introducing a new one without authorization. Replacing it with a placeholder vendor endpoint was rejected because it would still encode an unnecessary provider association.

### Keep the OpenAI-compatible abstraction provider-neutral

The source type comment will describe the protocol rather than a concrete vendor. Runtime configuration and fallback behavior remain unchanged, avoiding any `/api/chat` or SSE compatibility risk.

### Verify with a bounded, case-insensitive repository scan

The verification command will include ignored project files because local configuration and local settings are in scope, while excluding dependency, VCS, build, coverage, and test-result directories. This is more complete than a tracked-file-only check and avoids traversing generated bulk output.

## Risks / Trade-offs

- [A developer expected the removed local endpoint] → Generic configuration remains available; a developer can explicitly configure an authorized provider outside this cleanup.
- [A new occurrence appears in an ignored file] → The verification scan includes ignored files and is documented in the task evidence.
- [Sensitive local values appear in diagnostics] → Commands report paths/counts only; no configuration values or credentials are printed.

## Migration Plan

1. Remove provider-specific local values, metadata, and permissions.
2. Run the bounded repository scan and relevant type/configuration tests.
3. If a local developer needs an AI gateway afterward, configure an approved provider through the existing generic configuration surface.

Rollback consists of re-adding an authorized, provider-neutral local configuration value; no application migration, deployment, or data rollback is required.

## Open Questions

None.
