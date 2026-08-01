## 1. Empty-stream recovery repair

- [x] 1.1 Replace turn-global `EMPTY_CONTENT` retry accounting with source-aware accounting while retaining existing reconnect caps and final SSE fallback behavior.
- [x] 1.2 Record source-aware empty-stream recovery decisions in the existing routing report without changing analytics or SSE schemas.

## 2. Regression coverage and validation

- [x] 2.1 Extend the focused player-stream fallback test for sequential empty primary and fallback sources, including bounded terminal fallback behavior.
- [x] 2.2 Run the focused player-stream fallback test and the existing `/api/chat` contract verification relevant to the modified route; report results.
