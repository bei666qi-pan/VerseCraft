# Mobile Reading UI

This folder owns the mobile-first reading shell for `/play`.

It intentionally does not own the `/api/chat` stream, turn commit, option regeneration,
Zustand persistence, or game-state mutation rules. `src/app/play/page.tsx` remains the
orchestrator for those business flows and passes only the required props into this UI layer.

## Boundaries

- `MobileReadingShell` provides the document-scrolling reading surface and root `data-testid`. On
  desktop it centers a phone-width shell instead of stretching the reading UI edge-to-edge. It also
  toggles the `vc-play-reading-page` class on `html` / `body` so the browser safe areas inherit the
  same dark background without locking document scrolling.
- `MobileReadingHeader` owns the brand/page/audio row for in-shell pages such as character and codex.
  The default story state intentionally does not render this header so the reading surface can match
  the mobile-browser reference screenshot.
- `MobileStoryViewport` wraps the story area that still renders through `PlayStoryScroll`. It must
  not become the primary vertical scroll container; `/play` relies on document/window scrolling so
  mobile browser address bars can collapse naturally.
- `MobileActionDock` owns the bottom input pill and uses `useMobileActionDock` for local UI
  state such as submit flash, helper text, and talent button labels.
- `MobileCharacterPanel` owns the mobile character tab: identity, originium balance, location,
  time, current profession, and attribute upgrade controls. It receives data and callbacks from
  `/play`; it does not read the store directly.
- `MobileCodexPanel` owns the mobile codex tab: B1 NPC cards, identified count, portrait
  placeholders, and the detail panel. It receives codex data from `/play`; it does not read the
  store directly or open the old modal.
- `MobileSettingsPanel` owns the mobile settings tab: account display, game guide entry, real
  volume/mute controls, persisted reading preferences, chapter switch entry, and the existing exit
  confirmation callback. It is an in-shell page, not a `UnifiedMenuModal` sidebar.
- `GameGuideModal` and `ChapterSwitchModal` are settings-only overlays. Guide content lives in
  `settingsCopy.ts`; chapter rows come from the real chapter definitions/state through
  `settingsChapters.ts`.
- `readingPreferences.ts` owns the typed preference defaults, normalization, button labels, and CSS
  variable mapping used by the story text and option labels.
- `MobileOptionsDropdown` owns the visual list of four model-delivered options.
- `MobileOptionsEmptyState` owns the restrained empty / regenerating state below the input dock.
- `MobileBottomNav` owns the visual dock and receives `activeItem` from `/play`.
  Character opens the in-shell `MobileCharacterPanel`; codex opens the in-shell `MobileCodexPanel`;
  settings opens the in-shell `MobileSettingsPanel`. When the story tab is already active, `/play`
  uses that visible tab as the lightweight chapter navigator trigger instead of showing a permanent
  chapter pill above the story text.
- `theme.ts` and `icons.tsx` keep visual tokens and icon choices in one place.

## Theme Tokens

Edit `theme.ts` first when changing screenshot-level visual language. It exports:

- `mobileReadingTokens` for the stable values: near-black background, warm-gold palette,
  translucent border levels, story text colors, glow shadows, mobile spacing, dock heights,
  input height, and safe-area padding.
- `mobileReadingTheme` for the Tailwind class strings consumed by the shell components.

Keep new color, glow, border, height, and safe-area values in this file. Small one-off layout
classes are acceptable inside components, but do not scatter a second visual system across the
reading shell.

## Icons

Edit `icons.tsx` for the custom mobile reading icon system. The icons are inline SVG React
components, use `currentColor`, share rounded stroke caps/joins, and are designed to remain clear
at 24, 28, 32, and 40 px. Do not swap this layer back to lucide or external image assets.

The main exports are:

- `MobileReadingIcons` for header, action dock, option, send, and bottom nav icons.
- `MobileReadingTalentIcons` for the six echo talents.
- `MobileReadingTalentIcon` for rendering the correct echo talent glyph from a stored label.
- `getMobileReadingTalentIcon()` for mapping a stored talent label to its icon with a safe default.
- `MobileReadingIcons.CodexBook` / `CodexEye` / `CodexHeart` for the mobile codex detail sections.
- `MobileReadingIconProps` / `MobileReadingIcon` / `MobileReadingTalentIconProps` for adding future
  icons consistently.

Buttons should provide `aria-label`; icon components also accept a `title` prop for standalone
accessible SVG use.

Codex data helpers live next to the shell:

- `codexCatalog.ts` lists the current B1 NPC display slots.
- `codexPortraits.ts` is the only place to register future portrait image paths. The current UI
  intentionally renders CSS silhouettes when no portrait is configured.
- `codexFormat.ts` owns identified counts, default selection, player-facing location labels, and
  detail text fallbacks.

Do not add SSE parsing, final-frame handling, store persistence, task/codex/warehouse mutation,
or option regeneration business logic here. Keep those in the existing play orchestration and
turn-commit modules.
