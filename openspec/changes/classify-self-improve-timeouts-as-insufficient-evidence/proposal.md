## Why

The self-improvement strict gate currently treats timed-out or otherwise unusable live traces as valid gameplay evidence. This produced ten false oracle failures in one campaign while three expected-rejection cases falsely passed without any DM result, so repair automation cannot distinguish product defects from missing evidence.

## What Changes

- Mark deterministic case results as inconclusive when execution did not produce a parsed authoritative DM payload or recorded execution errors.
- Make the strict verifier report unusable scenario results as insufficient evidence instead of oracle expectation mismatches.
- Preserve all existing expectations, gate thresholds, scenario fixtures, and holdout files.
- Add regression coverage for the observed timeout-shaped artifacts before changing production behavior.

## Capabilities

### New Capabilities

- `self-improve-evidence-validity`: Defines when self-improvement traces are eligible for deterministic oracle scoring and how the strict gate reports unusable evidence.

### Modified Capabilities

None.

## Impact

Affected code is limited to `src/lib/evals/selfImprove/*` and its unit tests. There is no change to `/api/chat`, SSE/DM JSON contracts, client/store state, analytics events, database schema, prompts, model routing, holdouts, or runtime latency budgets. The change prevents infrastructure failures from entering the automated repair queue as gameplay defects.
