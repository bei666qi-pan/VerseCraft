---
status: accepted
---

# Use one online Turn Engine and one asynchronous World Director

VerseCraft uses an explicit TypeScript Player Turn workflow as the only online commit authority and one asynchronous World Director workflow for future planning. LangGraph, a separate DM Agent final chain, client event direction, independent Actor model calls, Director tool loops and LLM critics created parallel execution models without additional authority; they are removed so budgets, failure behavior and tests have one high-leverage Interface and one place of locality.

Director planning is limited to one model invocation per eligible tick. Actor context is projected deterministically into that invocation, and deterministic policies can only subtract unsafe output. Legacy client Story Director state remains readable only for migration into Chapter Pacing state.

## 2026-09-03 amendment: narrow Writer wire contract

The Writer model emits only `narrative`, four candidate `options`, `turn_mode` and `decision_required` through the single `submit_narrative` terminal tool. The former state-bearing full DM JSON terminal, its feature switch and its compatibility retry are removed. Server code projects safe defaults, Mechanics receipts carry registered state deltas, and the sole Turn Finalizer remains the only commit authority.

This reduces schema decoding work, removes a second failure/retry path and makes state ownership enforceable in code. Live acceptance measures the first concrete narrative character separately from JSON/tool protocol bytes: p95 remains at most 5 seconds and no turn may exceed 8 seconds. Options maintenance is deterministic and has one 5-second client/server ceiling.
