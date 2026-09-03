---
status: accepted
---

# Use one online Turn Engine and one asynchronous World Director

VerseCraft uses an explicit TypeScript Player Turn workflow as the only online commit authority and one asynchronous World Director workflow for future planning. LangGraph, a separate DM Agent final chain, client event direction, independent Actor model calls, Director tool loops and LLM critics created parallel execution models without additional authority; they are removed so budgets, failure behavior and tests have one high-leverage Interface and one place of locality.

Director planning is limited to one model invocation per eligible tick. Actor context is projected deterministically into that invocation, and deterministic policies can only subtract unsafe output. Legacy client Story Director state remains readable only for migration into Chapter Pacing state.
