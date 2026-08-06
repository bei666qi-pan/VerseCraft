## ADDED Requirements

### Requirement: World Director graph supports PostgreSQL-backed checkpointing

When the LangGraph path is active, the World Director main graph SHALL use `PostgresSaver` for automatic checkpoint persistence after each node execution.

The checkpoint SHALL be stored in a `langgraph_checkpoints` table managed by LangGraph's `PostgresSaver`, using the existing PostgreSQL `pool` connection.

Checkpoints SHALL be configurable via `VERSECRAFT_ENABLE_LANGGRAPH_CHECKPOINT` (default `true` when LangGraph is enabled).

#### Scenario: Checkpoint saved after each node

- **WHEN** the World Director graph executes and completes the `run_reasoner` node
- **THEN** a checkpoint containing the current graph state is persisted to `langgraph_checkpoints`

#### Scenario: Checkpoint disabled does not write

- **WHEN** `VERSECRAFT_ENABLE_LANGGRAPH_CHECKPOINT=false`
- **THEN** no checkpoints are written during graph execution, and the `PostgresSaver` is not initialized

### Requirement: World Director graph supports interrupt and resume

The World Director graph SHALL support LangGraph `interrupt_before` on the `run_reasoner` and `run_critic` nodes to enable pause-before-LLM-call semantics.

The graph SHALL be resumable from the latest checkpoint via `graph.getState(config)` followed by `graph.invoke(null, config)`.

If no checkpoint exists for the given `config`, `graph.invoke()` SHALL start from the beginning.

#### Scenario: Resume from checkpoint after interruption

- **WHEN** the graph was interrupted before `run_reasoner` and a checkpoint exists
- **THEN** `graph.invoke(null, restoredConfig)` resumes execution from `run_reasoner` node, not from START

#### Scenario: Fresh invocation when no checkpoint exists

- **WHEN** `graph.invoke(initialState, newConfig)` is called with no prior checkpoint
- **THEN** execution starts from the START node with the provided `initialState`

### Requirement: Checkpoints have a 7-day TTL

Checkpoints stored in `langgraph_checkpoints` SHALL be automatically cleaned up after 7 days.

A cleanup job SHALL run via a scheduled cron or a `DELETE` query on `created_at < NOW() - INTERVAL '7 days'` executed during each World Director tick startup.

#### Scenario: Expired checkpoint is cleaned up

- **WHEN** a checkpoint's `created_at` timestamp is older than 7 days
- **THEN** the cleanup job removes it from `langgraph_checkpoints` during the next World Director tick

#### Scenario: Recent checkpoint is retained

- **WHEN** a checkpoint's `created_at` timestamp is less than 7 days old
- **THEN** the checkpoint is preserved in the database and available for resume
