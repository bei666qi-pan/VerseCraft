# Issue Worker Runbook

This repository is maintained by small, issue-driven Codex cycles. Each cycle must do one bounded task, keep game contracts intact, and leave a testable commit.

## Execution Order

1. Confirm the project boundary with `scripts/check-project-boundary.ps1`.
2. Prefer any open issue labeled `codex:working`.
3. Otherwise pick one open issue labeled both `agent:approved` and `codex:ready`.
4. Move the issue from `codex:ready` to `codex:working`.
5. Read the issue body, `AGENTS.md`, and `docs/ACCEPTANCE.md`.
6. Implement only the approved scope.
7. Run required verification.
8. Update `docs/AUTO_ITERATION_LOG.md` and `docs/TODO.md`.
9. Commit, push, comment on the issue, move it to `codex:done`, and close it.

## Labels

Only issues with both labels may be executed automatically:

- `agent:approved`
- `codex:ready`

State labels:

- `codex:ready`
- `codex:working`
- `codex:blocked`
- `codex:done`

Priority labels:

- `priority:P0`
- `priority:P1`
- `priority:P2`

Risk labels:

- `risk:low`
- `risk:medium`
- `risk:high`

Type labels:

- `type:gameplay`
- `type:npc-life`
- `type:ai`
- `type:reasoner`
- `type:test`
- `type:deploy`
- `type:ux`
- `type:bug`
- `type:docs`

## Hard Stops

Mark the issue `codex:blocked` instead of implementing if it asks to:

- print, commit, upload, or expose secrets;
- delete tests to pass verification;
- bypass `/api/chat` SSE/JSON contracts;
- let AI directly decide authoritative game state;
- put vc-Reasoner on the blocking player turn path;
- deploy without lint, build, issue-specific tests, and secret leak checks.

## Required Verification

Every implementation cycle should run:

```powershell
npx eslint .
pnpm build
```

Also run the issue-specific tests. Use:

- gameplay changes: relevant Playwright or playtest specs;
- NPC changes: npc-life, epistemic, or consistency tests;
- save/load changes: persistence and migration tests;
- deploy changes: `scripts/verify-production.ps1` after deployment.

If verification still fails after one focused repair, revert this cycle's uncommitted changes, comment on the issue, label it `codex:blocked`, and do not commit broken code.
