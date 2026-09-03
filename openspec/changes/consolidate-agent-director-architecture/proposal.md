# Consolidate Agent and Director architecture

VerseCraft currently has parallel online finalization paths, client and server Director concepts, and multiple background model stages. Consolidate them into one Player Turn workflow and one asynchronous World Director while preserving SSE, dual-world mechanics and save compatibility.

This change also establishes invocation budgets, removes duplicate projections and replaces implementation-detail tests with Module Interface contracts.
