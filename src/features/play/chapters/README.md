# Play Chapters

`src/features/play/chapters` is the mobile reading UI layer for `/play` chapter
progression. The source of truth lives in `src/lib/chapters`; this folder only
renders the shell controls and calls store actions.

- `ChapterNavigator` is the in-story "小说目录" panel: outer shell only, rows come
  from `ChapterTocList`.
- `ChapterTocList` is the **only** chapter-row renderer. It reads
  `selectChapterTocRows` (`src/lib/chapters/selectors.ts`) and is shared with
  `ChapterSwitchModal` in `src/features/play/mobileReading/components` (the
  settings-only "切换章节" dialog) so both entry points show the same status
  wording, excerpts, and selectability instead of two parallel implementations.
  Callers only differ by shell chrome, `rowTestId`, `titleStyle` ("colon" vs
  "dot"), and whether `allowEnterNext` (Settings never allows jumping forward).
- `ChapterPageTurnOverlay` is the full-screen page-turn transition (see
  `.vc-chapter-page-turn-*`/`.vc-cpt-*` in `globals.css`): a 3D `rotateY` paper
  curl with a contact-shadow layer and a fold sheen, auto-playing over ~600ms.
  Its `active`/`direction` prop contract is unchanged; `page.tsx`'s
  `runChapterPageTurn` still drives it.
- `ChapterEndSheet` displays the end-of-chapter summary and advances to the next chapter.
- `ChapterSummaryList` renders non-empty summary sections.
- `useChapterRuntime` is the `/play` wiring hook.

There is no `ChapterHeaderPill` anymore — it was exported but never rendered
(confirmed unused via `chapter-header-pill` having count 0 in e2e) and was
removed as part of the chapter-navigation consolidation.

Do not add `/api/chat` fields or parse narrative text in this layer. Chapter
progress is recorded after a committed turn from structured state signals.
