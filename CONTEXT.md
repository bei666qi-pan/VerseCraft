# VerseCraft Narrative Runtime

VerseCraft turns player intent into an authoritative game turn while allowing the world to advance asynchronously. These terms define the single canonical language for that runtime.

## Language

**Player Turn**:
A player's submitted action together with the authoritative outcome committed for that action.
_Avoid_: chat message, DM response

**Writer**:
The sole author of player-visible narrative. Writer output is always a candidate until the Turn Engine commits it.
_Avoid_: main model, narrator agent, DM Agent

**Mechanics Workflow**:
A bounded tool-assisted path for actions that require registered game rules. It produces a candidate and receipts but never commits state.
_Avoid_: DM Agent, autonomous agent loop

**Turn Engine**:
The sole authority that validates, resolves and commits a Player Turn and emits its final envelope.
_Avoid_: route finalizer, DM final chain

**Turn Candidate**:
Untrusted structured narrative and state proposals produced by Writer or the Mechanics Workflow.
_Avoid_: result, final turn

**Mechanics Receipt**:
An immutable record of a validated mechanics command, its world scope, idempotency identity and proposed state delta.
_Avoid_: tool result

**Committed Turn Receipt**:
The authoritative, immutable summary of a committed Player Turn consumed by background work.
_Avoid_: client digest, raw DM JSON

**Chapter Pacing Controller**:
The deterministic client projection used for chapter progress and presentation. It cannot schedule world events or override the World Director.
_Avoid_: Story Director, chapter agent

**World Director**:
The single asynchronous planner for future world direction, NPC intentions and event agenda. It never changes the current Player Turn.
_Avoid_: World Engine agent, Story Director

**Director Plan**:
An untrusted structured proposal from the World Director model that becomes usable only after deterministic policy acceptance.
_Avoid_: world fact, committed event

**Director Directive**:
A bounded, player-safe projection of accepted future direction made available to Writer for an applicable later turn.
_Avoid_: prompt string, hidden plan

**World Scope**:
The indivisible `worldId`, `mapId` and `sessionId` identity attached to every world-state read, command and plan.
_Avoid_: inferred scope, session-only scope
