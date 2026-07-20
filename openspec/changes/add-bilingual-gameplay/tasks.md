## 1. Language preference and generation contract

- [x] 1.1 Add the typed persisted language preference, document language sync,
  and character/settings controls with backward-compatible migration coverage.
- [x] 1.2 Thread the optional language through chat validation, the dynamic DM
  prompt, and all option-generation/repair paths without changing SSE frames.
- [x] 1.3 Add unit and contract coverage for language normalization, English
  prompt directives, character validation, and omitted-language compatibility.

## 2. Localized play experience

- [x] 2.1 Localize the mobile play shell, guide, settings, waiting, and
  navigation chrome for both supported languages.
- [x] 2.2 Localize character, task, codex, chapter, and settlement surfaces,
  including deterministic registry-backed display data while retaining
  canonical state values.
- [x] 2.3 Audit remaining player-visible static Chinese copy in `/play` and
  route it through the selected language without changing gameplay behavior.

## 3. Verification and release

- [x] 3.1 Run focused language, prompt, and chat-contract tests; run lint and
  record any unrelated repository build/type blockers.
- [x] 3.2 Verify Chinese and English `/play` behavior at 390×844, 393×852, and
  430×932, using the in-app browser when available and Playwright otherwise.
- [x] 3.3 Sync the validated delta spec, commit only scoped changes, and deploy
  through the established GitHub → Gitee → Coolify flow with a healthy online
  verification.

## 4. Task panel language consistency and visual refinement

- [x] 4.1 Extend the explicit language-switch presentation path so current
  task display text is translated and committed atomically without changing
  task mechanics or `/api/chat`.
- [x] 4.2 Refresh the mobile task board hierarchy and compact action treatment
  while preserving task-panel actions, state, and test selectors.
- [x] 4.3 Remove the redundant centered type word from unknown codex portrait
  cards and update the focused rendering tests.
- [x] 4.4 Add task-localization and mobile UI regressions; run lint, relevant
  unit/contract tests, build, and 390×844 / 393×852 / 430×932 visual checks.
