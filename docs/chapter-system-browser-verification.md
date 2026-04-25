# Chapter System Browser Verification

## 2026-04-25

Status: verified with Playwright Chromium.

Dev server:

```bash
pnpm dev
```

Target URL:

```text
http://127.0.0.1:666/play
```

Browser method:

- Browser Use in-app browser was attempted first.
- It could not initialize because the local `node_repl` runtime resolved
  `D:\node\node.exe` v22.17.1 and requires Node >= 22.22.0.
- Verification fell back to Playwright Chromium against the live dev server,
  which still exercises a real browser and the real `/play` page.

Viewports:

- 390x844
- 393x852
- 430x932
- 1280x900

Manual-equivalent checks covered:

- Current chapter title displays as `第一章：暗月初醒`.
- A valid action can complete chapter 1 and display `ChapterEndSheet`.
- `进入下一章` switches to `第二章：门后回声`.
- In chapter 2, `ChapterNavigator` can open chapter 1 review.
- `回到当前章` restores chapter 2.
- Input, options, codex, and settings remain usable after chapter navigation.
- Pruned entries remain absent: taskbar, guide, journal, warehouse, achievements,
  weapons.
- No horizontal overflow.
- No client-side exception.

Commands and results:

```bash
npx eslint .
```

Result: passed with existing repository warnings, 0 errors.

```bash
pnpm test:unit
```

Result: passed, 1003 tests.

```bash
pnpm exec playwright test e2e/play.spec.ts
```

Result: passed, 9 tests.

```bash
pnpm exec playwright test e2e/chapter-flow.spec.ts
```

Result: passed, 7 tests.

```bash
pnpm exec playwright test e2e/mobile-reading-ui.spec.ts
```

Result: passed, 11 tests. This run includes responsive smoke checks for
390x844, 393x852, 430x932, and 1280x900.

```bash
pnpm exec playwright test e2e/play.spec.ts e2e/chapter-flow.spec.ts
```

Result: passed, 16 tests.

```bash
pnpm build
```

Result: passed. Next.js emitted the existing `middleware` convention
deprecation warning.

```bash
pnpm test:ci
```

Result: passed. `db:check:optional` reported local PostgreSQL
`ECONNREFUSED 127.0.0.1:5432` and skipped as optional, then build passed.

Screenshot artifacts:

- `test-results/mobile-reading-ui-mobile-r-5bca8-ed-and-expanded-screenshots-chromium/mobile-reading-collapsed-390.png`
- `test-results/mobile-reading-ui-mobile-r-5bca8-ed-and-expanded-screenshots-chromium/mobile-reading-expanded-390.png`
- Temporary chapter verification screenshots were also written under
  `.runtime-data/chapter-system/` during the Playwright fallback run.

Observed issues and fixes:

- `e2e/play.spec.ts` still assumed the old settings modal exposed a Codex tab.
  Updated it to expect settings-only modal tabs, matching the mobile Codex
  in-shell page.
- Old route pruning tests were slow in a local environment without PostgreSQL
  because analytics and presence heartbeats tried to connect to
  `127.0.0.1:5432`. The test now mocks those client heartbeat endpoints while
  preserving route/UI pruning assertions.
- A hand-written temporary browser script was discarded because its IndexedDB
  seed was less stable than the maintained Playwright specs. The maintained
  specs are the canonical verification path for this feature.

Known environment noise:

- Local dev logs can include PostgreSQL `ECONNREFUSED 127.0.0.1:5432` for
  analytics/presence when no database is running. The verified Playwright specs
  isolate this where it is unrelated to chapter behavior.
