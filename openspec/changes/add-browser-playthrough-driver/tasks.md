## 1. Browser playthrough driver

- [x] 1.1 Add typed player-visible observation, decision-provider, turn-evidence, and trace contracts under `e2e/support`.
- [x] 1.2 Implement the clean-context `/intro → /create → /play` local-character startup helper without storage pre-seeding or chat interception.
- [x] 1.3 Implement multi-turn visible-input execution, authoritative SSE final parsing, screenshot/trace persistence, and deterministic sequence decision provider.

## 2. Verification

- [x] 2.1 Add an opt-in real-gateway Playwright E2E that starts from intro/create, completes two actions, records evidence, reloads, and verifies a playable local save.
- [x] 2.2 Run focused E2E in its skipped/default mode and, when gateway credentials are available, run the `E2E_AI_LIVE=1` path; run `npx eslint .` and report any environment block.
- [x] 2.3 Validate the OpenSpec change and mark completed tasks with the executed verification evidence.

## 3. Codex external decision handoff

- [x] 3.1 Add typed run-scoped request/decision/ticket contracts and an atomic file-handoff decision provider with timeout and stale-decision rejection.
- [x] 3.2 Add a validated local CLI for Codex to submit a matching action or explicit stop decision.
- [x] 3.3 Add an opt-in Codex handoff Playwright campaign and a focused automated handshake test that proves browser turns are driven through the submitted decision file.
- [x] 3.4 Run lint, focused handoff verification, OpenSpec validation, and document the exact prerequisites and commands for starting a true-gateway Codex playtest.
- [x] 3.5 Add developer and blind-player mode contracts, handoff metadata, and operator documentation for the two one-phrase launch workflows.
