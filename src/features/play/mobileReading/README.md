# Mobile Reading UI

This folder owns the mobile-first reading shell for `/play`.

It intentionally does not own the `/api/chat` stream, turn commit, option regeneration,
Zustand persistence, or game-state mutation rules. `src/app/play/page.tsx` remains the
orchestrator for those business flows and passes only the required props into this UI layer.

## Boundaries

- `MobileReadingShell` provides the `100dvh` reading surface and root `data-testid`.
- `MobileReadingHeader` owns the brand/chapter/audio row.
- `MobileStoryViewport` wraps the scrollable story area that still renders through
  `PlayStoryScroll`.
- `MobileActionDock` owns the bottom input pill and uses `useMobileActionDock` for local UI
  state such as submit flash, helper text, and talent button labels.
- `MobileOptionsDropdown` owns the visual list of four model-delivered options.
- `MobileBottomNav` owns the visual dock. Character is intentionally non-routing for now;
  codex and settings continue through `UnifiedMenuModal`.
- `theme.ts` and `icons.tsx` keep visual tokens and icon choices in one place.

Do not add SSE parsing, final-frame handling, store persistence, task/codex/warehouse mutation,
or option regeneration business logic here. Keep those in the existing play orchestration and
turn-commit modules.
