# Acceptance Checklist

Use this checklist before closing any automation issue.

## Project Boundary

- Current directory is the canonical `versecraft-game` / `game-versecraft` checkout.
- `git rev-parse --show-toplevel` succeeds.
- Remote points to the intended VerseCraft game repository.
- No unrelated projects or servers were modified.

## Architecture

- Rule Engine remains the source of truth for state.
- AI Narrator produces narrative candidates only.
- StateDelta is deterministic.
- NPC behavior preserves location, memory, relationship, goal, and epistemic boundaries.
- vc-Reasoner / World Director work stays non-blocking and off the realtime player turn path.
- mockAI remains playable.
- Missing AI keys still degrade to playable behavior.
- NPC output does not reveal `dmOnlyFacts` outside actor knowledge.
- Free input still flows through parser, rule engine, state delta, narrative candidate, validator, commit, and render.

## Verification

Required for every code cycle:

```powershell
npx eslint .
pnpm build
```

Also run issue-specific commands and any relevant playtest, NPC, save/load, or production smoke checks.

## Secret Safety

- Do not print API keys, tokens, cookies, or environment variable values.
- Run `scripts/verify-no-secret-leak.ps1` before deploy or release.
- Commit only intentional files.

## Deployment

Deploy only when the issue explicitly requires it or is labeled `type:deploy`. Deployment requires passing lint, build, issue-specific tests, secret leak checks, and production verification.
