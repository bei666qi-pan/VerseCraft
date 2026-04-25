# Play Chapters

`src/features/play/chapters` is the mobile reading UI layer for `/play` chapter
progression. The source of truth lives in `src/lib/chapters`; this folder only
renders the shell controls and calls store actions.

- `ChapterHeaderPill` opens the chapter navigator from the story view.
- `ChapterNavigator` lists unlocked chapters and starts safe review.
- `ChapterEndSheet` displays the end-of-chapter summary and advances to the next chapter.
- `ChapterSummaryList` renders non-empty summary sections.
- `useChapterRuntime` is the `/play` wiring hook.

Do not add `/api/chat` fields or parse narrative text in this layer. Chapter
progress is recorded after a committed turn from structured state signals.
