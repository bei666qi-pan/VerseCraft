import { pool } from "@/db/index";
import { runDirectorPlanCriticTask, runOfflineReasonerTask } from "@/lib/ai/logicalTasks";
import type { ChatMessage, AIRequestContext } from "@/lib/ai/types/core";
import { createTracingAdapter, startTurnTrace, startStageSpan, endTurnTrace } from "@/lib/observability/langfuse";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { getAppRedisClient } from "@/lib/ratelimit";
import { applySocialGmDeltas, type SocialGmApplyResult } from "@/lib/socialWorld/applyDeltas";
import { selectActiveNpcsForSocialTick } from "@/lib/socialWorld/activation";
import { resolveSocialWorldConfig, type SocialWorldConfig } from "@/lib/socialWorld/config";
import {
  countPendingSocialEvents,
  loadNpcAgentStates,
  loadRecentSocialEventsForCooldown,
} from "@/lib/socialWorld/persistence";
import type { NpcAgentState } from "@/lib/socialWorld/types";
import { insertDirectorAgendaItems } from "./agenda";
import { resolveWorldDirectorConfig } from "./config";
import { runWorldDirectorReasonerWithTools } from "./directorTools";
import {
  parseWorldEngineDeltaJson,
  type DirectorPlan,
  type WorldEngineTrigger,
  type WorldEngineStructuredDelta,
  type WorldEngineTickPayload,
} from "./contracts";
import {
  computeNextDirectorState,
  loadDirectorState,
  saveDirectorState,
  type WorldDirectorState,
} from "./directorState";
import { validateDirectorPlan, type DirectorValidationResult } from "./validator";
import type { ActorSimulationContext } from "./actorSimulation/integration";

export async function loadRecentWorldFacts(userId: string | null, sessionId: string): Promise<string[]> {
  if (!userId) return [];
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    console.warn('[worldEngine] pool.connect failed in loadRecentWorldFacts', {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
  try {
    const r = await client.query<{ raw_fact: string }>(
      `SELECT raw_fact
       FROM world_player_facts
       WHERE user_id = $1 AND session_id = $2
       ORDER BY id DESC
       LIMIT 24`,
      [userId, sessionId]
    );
    return r.rows.map((x) => String(x.raw_fact ?? "").trim()).filter(Boolean);
  } catch (e) {
    console.warn('[worldEngine] query failed in loadRecentWorldFacts', {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  } finally {
    client.release();
  }
}

export async function loadRecentAgendaSummary(sessionId: string): Promise<Array<Record<string, unknown>>> {
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    console.warn('[worldEngine] pool.connect failed in loadRecentAgendaSummary', {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
  try {
    const r = await client.query<Record<string, unknown>>(
      `SELECT event_code, title, status, due_turn_index, expires_turn_index, salience, priority
       FROM world_engine_event_queue
       WHERE session_id = $1
       ORDER BY id DESC
       LIMIT 16`,
      [sessionId]
    );
    return r.rows;
  } catch (e) {
    console.warn('[worldEngine] query failed in loadRecentAgendaSummary', {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  } finally {
    client.release();
  }
}

function summarizePlayerBehavior(input: WorldEngineTickPayload): Record<string, unknown> {
  const action = input.latestUserInput.toLowerCase();
  return {
    exploration: /看|观察|检查|调查|search|inspect|look/.test(action),
    dialogue: /问|说|喊|对话|告诉|ask|talk|say/.test(action),
    confrontation: /打|砸|冲|逃|躲|fight|attack|run|hide/.test(action),
    repeated_investigation_hint: /继续检查|再检查|反复|一直看/.test(action),
    movement_changed:
      Boolean(input.previousPlayerLocation?.trim()) &&
      Boolean(input.playerLocation?.trim()) &&
      input.previousPlayerLocation?.trim() !== input.playerLocation?.trim(),
  };
}

const SOCIAL_WORLD_TRIGGER_SET = new Set<WorldEngineTrigger>([
  "multi_room_movement",
  "key_story_node_hit",
  "important_npc_state_changed",
  "world_fact_threshold_reached",
  "plot_stagnation_detected",
  "repeated_investigation_loop",
  "due_hook_reached",
  "npc_agenda_due",
  "clue_threshold_reached",
]);

type SocialWorldTickContext = {
  config: SocialWorldConfig;
  tickTriggered: boolean;
  skipReason: string | null;
  activeNpcIds: string[];
  pendingEventCount: number;
};

type SocialWorldTelemetry = {
  socialWorldMode: SocialWorldConfig["mode"];
  socialTickTriggered: boolean;
  socialActiveNpcCount: number;
  socialEventsAccepted: number;
  socialEventsRejected: number;
  socialPromptChars: number;
  socialQueryLatencyMs: number;
  socialReasonerLatencyMs: number;
  socialRejectedByCode: Record<string, number>;
  socialProjectionSkippedReason?: string | null;
  socialPendingEventCount: number;
  socialTickSkippedReason: string | null;
};

function shouldTriggerSocialTick(triggers: readonly WorldEngineTrigger[]): boolean {
  return triggers.some((trigger) => SOCIAL_WORLD_TRIGGER_SET.has(trigger));
}

function socialRejectedByCode(result: SocialGmApplyResult | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of result?.issues ?? []) {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  }
  return counts;
}

export function buildWorldEngineMessages(input: {
  payload: WorldEngineTickPayload;
  recentFacts: string[];
  recentAgenda: Array<Record<string, unknown>>;
  directorState: WorldDirectorState | null;
  socialWorld: SocialWorldTickContext;
}): ChatMessage[] {
  const socialPolicy = input.socialWorld.tickTriggered
    ? [
        "Social World Engine schema extension is enabled for this tick: you may output social_events_to_schedule, npc_relation_deltas, and npc_agent_patches as optional candidate fields.",
        "Social World Engine candidates do not directly change the world; deterministic validators and later persistence decide what can commit.",
        "Do not leak private hooks, must_not_reveal items, hidden truths, or NPC-private knowledge through social events.",
        "NPC social actions must be based only on their knowledge_scope and plausible known facts.",
        "Social events must not force player failure, remove player agency, or decide the player's action.",
      ]
    : [
        "Social World Engine is disabled for this tick; output empty social_events_to_schedule, npc_relation_deltas, and npc_agent_patches.",
      ];
  const system = [
    ...socialPolicy,
    "你是 VerseCraft 的后台 World Director，不是玩家可见主笔。",
    "你的任务是评估节奏、张力、疲劳、伏笔压力、连续性风险和玩家自主性风险，并输出可验证的导演计划。",
    "不要输出玩家可见 narrative，不要替玩家做决定，不要强制玩家失败，不要提前揭示核心真相。",
    "所有事件只能作为后续主叙事可选择采用的软提示；每个事件必须说明玩家自主性约束和禁止结果。",
    "若 world_events_to_schedule 非空，每个事件必须包含：event_code、title、due_in_turns、ttl_turns、priority、salience、trigger_conditions、injection_hint、agency_constraints、forbidden_outcomes、payload。缺任一字段的事件会被系统丢弃。",
    "当 trigger_signals 含 multi_room_movement、repeated_investigation_loop、key_story_node_hit 或 due_hook_reached 时，除非明确无安全且可逆的提示，至少给出 1 个可观察、可拒绝的事件；injection_hint 必须是主笔可直接采用的短提示，而非计划摘要。",
    "player_private_hooks 永远不能直接展示给玩家，也不能把隐藏真相、NPC 私有知识或伏笔原文写进 injection_hint。",
    "control risk tags 只用于安全/节奏评估，不能把 political、violence 等安全标签直接变成剧情事件。",
    "NPC 后台行动必须尊重 knowledge_scope；NPC 不应围绕自己不知道的事实行动。",
    "请严格以 JSON 格式输出，且只输出一个 schema_version 为 director_plan_v1 的 JSON 对象。",
    "必须包含字段：schema_version, director_intent, current_phase, target_phase, pacing_assessment, risk_assessment, reveal_policy, npc_next_actions, world_events_to_schedule, story_branch_seeds, consistency_warnings, player_private_hooks。",
  ].join("\n");

  const user = JSON.stringify(
    {
      session_id: input.payload.sessionId,
      turn_index: input.payload.turnIndex,
      latest_user_input: input.payload.latestUserInput.slice(0, 800),
      trigger_signals: input.payload.triggerSignals,
      control_risk_tags_for_assessment_only: input.payload.controlRiskTags,
      dm_narrative_preview: input.payload.dmNarrativePreview.slice(0, 1200),
      player_location: input.payload.playerLocation,
      previous_player_location: input.payload.previousPlayerLocation ?? null,
      npc_location_update_count: input.payload.npcLocationUpdateCount,
      recent_facts: input.recentFacts.slice(0, 24),
      recent_agenda: input.recentAgenda.slice(0, 16),
      current_director_state: input.directorState
        ? {
            phase: input.directorState.phase,
            pacing: input.directorState.pacing,
            recent_director_intent: input.directorState.recentDirectorIntent,
            world_revision: input.directorState.worldRevision,
          }
        : null,
      social_world: {
        mode: input.socialWorld.config.mode,
        enabled_for_this_tick: input.socialWorld.tickTriggered,
        skip_reason: input.socialWorld.skipReason,
        active_npc_ids: input.socialWorld.activeNpcIds,
        active_npc_count: input.socialWorld.activeNpcIds.length,
        pending_event_count: input.socialWorld.pendingEventCount,
        pending_event_limit: input.socialWorld.config.maxPendingEventsPerSession,
      },
      recent_player_behavior_summary: summarizePlayerBehavior(input.payload),
      output_constraints: {
        event_count_max: 4,
        social_event_count_max: input.socialWorld.tickTriggered ? input.socialWorld.config.maxEventsPerTick : 0,
        npc_relation_delta_count_max: 12,
        npc_agent_patch_count_max: 8,
        npc_action_count_max: 6,
        prefer_reveal_policy_near_truth: "hint_only",
        agency_rule: "If a player action can reasonably avoid an event, the plan must allow avoidance.",
        social_event_rule:
          "Social events are candidates only; include knowledge_scope and must_not_reveal; never force player failure.",
      },
    },
    null,
    2
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parseCriticOutput(raw: string): {
  accept: boolean;
  accepted_event_codes: string[];
  reject_reasons: string[];
} | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.accept !== "boolean") return null;
    return {
      accept: obj.accept,
      accepted_event_codes: Array.isArray(obj.accepted_event_codes)
        ? obj.accepted_event_codes.filter((x): x is string => typeof x === "string").slice(0, 12)
        : [],
      reject_reasons: Array.isArray(obj.reject_reasons)
        ? obj.reject_reasons.filter((x): x is string => typeof x === "string").slice(0, 12)
        : [],
    };
  } catch {
    return null;
  }
}

export async function runOptionalCritic(args: {
  payload: WorldEngineTickPayload;
  plan: DirectorPlan;
  recentFacts: string[];
  validation: DirectorValidationResult;
}): Promise<DirectorValidationResult> {
  const cfg = resolveWorldDirectorConfig();
  if (!cfg.criticEnabled || !args.validation.accepted) return args.validation;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 VerseCraft World Director 的 deterministic critic，只负责把关，不写正文。",
        "请严格以 JSON 格式输出：{\"accept\":boolean,\"accepted_event_codes\":string[],\"reject_reasons\":string[],\"risk_overrides\":{}}。",
        "拒绝任何会降低玩家自主性、提前剧透、泄露隐藏钩子、强制玩家失败或违反 NPC 知识边界的计划。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          candidate_plan: args.plan,
          deterministic_validation: args.validation,
          recent_facts: args.recentFacts.slice(0, 24),
        },
        null,
        2
      ),
    },
  ];
  const res = await runDirectorPlanCriticTask({
    messages,
    ctx: {
      requestId: `${args.payload.requestId}:director_critic`,
      userId: args.payload.userId,
      sessionId: args.payload.sessionId,
      path: "/worker/world-director-critic",
      tags: { purpose: "director_plan_critic" },
    },
    requestTimeoutMs: 8_000,
    skipCache: true,
    devOverrides: { maxTokens: 512, temperature: 0, responseFormatJsonObject: true },
  });
  if (!res.ok) return args.validation;
  const parsed = parseCriticOutput(res.content ?? "");
  if (!parsed) return args.validation;
  if (!parsed.accept) {
    return {
      accepted: false,
      acceptedEventCodes: [],
      rejectedEventCodes: args.plan.world_events_to_schedule.map((x) => x.event_code),
      acceptedSocialEventCodes: [],
      rejectedSocialEventCodes: (args.plan.social_events_to_schedule ?? []).map((x) => x.event_code),
      issues: [
        ...args.validation.issues,
        ...parsed.reject_reasons.map((reason) => ({
          code: "critic_reject",
          message: reason,
          severity: "high" as const,
        })),
      ],
    };
  }
  const accepted = new Set(parsed.accepted_event_codes);
  if (accepted.size === 0) return args.validation;
  return {
    ...args.validation,
    acceptedEventCodes: args.validation.acceptedEventCodes.filter((code) => accepted.has(code)),
    rejectedEventCodes: Array.from(
      new Set([
        ...args.validation.rejectedEventCodes,
        ...args.validation.acceptedEventCodes.filter((code) => !accepted.has(code)),
      ])
    ),
  };
}

export async function writeWorldEngineOutputs(args: {
  payload: WorldEngineTickPayload;
  delta: WorldEngineStructuredDelta;
  validation: DirectorValidationResult;
  socialGm: SocialGmApplyResult | null;
  socialTelemetry: SocialWorldTelemetry;
  previousDirectorState: WorldDirectorState | null;
  /** LangGraph 路径生成的富导演提示块，写入 snapshot_json 供 promptAssembly 复用 */
  langgraphHintBlock?: string;
}): Promise<{ runId: number; worldRevision: bigint; agendaCreated: number; agendaSkipped: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const validationOutput = args.socialGm
      ? {
          ...args.validation,
          social_world: args.socialTelemetry,
          social_gm: {
            accepted_event_codes: args.socialGm.acceptedEventCodes,
            rejected_event_codes: args.socialGm.rejectedEventCodes,
            issues: args.socialGm.issues,
            writes: {
              events: args.socialGm.eventWrite,
              relations: args.socialGm.relationWrite,
              agents: args.socialGm.agentWrite,
              memory: args.socialGm.memoryWrite,
            },
          },
        }
      : {
          ...args.validation,
          social_world: args.socialTelemetry,
        };
    const run = await client.query<{ run_id: string }>(
      `INSERT INTO world_engine_runs (
         dedup_key, request_id, user_id, session_id, trigger_signals,
         model_task, status, output_json, error_message
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'succeeded', $7::jsonb, NULL)
       ON CONFLICT (dedup_key) DO UPDATE SET updated_at = NOW()
       RETURNING run_id`,
      [
        args.payload.dedupKey,
        args.payload.requestId,
        args.payload.userId,
        args.payload.sessionId,
        JSON.stringify(args.payload.triggerSignals),
        "WORLDBUILD_OFFLINE",
        JSON.stringify({
          ...args.delta,
          validation: validationOutput,
          agenda_write_allowed: args.delta.agenda_write_allowed && args.validation.accepted,
        }),
      ]
    );
    const runId = Number(run.rows[0]?.run_id ?? 0);

    const snapshot = {
      director_plan: args.delta,
      validation: validationOutput,
      npc_next_actions: args.delta.npc_next_actions,
      story_branch_seeds: args.delta.story_branch_seeds,
      consistency_warnings: args.delta.consistency_warnings,
      player_private_hooks: args.delta.player_private_hooks,
      event_count: args.validation.acceptedEventCodes.length,
      ...(args.langgraphHintBlock ? { langgraph_hint_block: args.langgraphHintBlock } : {}),
    };
    await client.query(
      `INSERT INTO world_engine_agenda_snapshots (
         run_id, session_id, user_id, agenda_revision, snapshot_json
       )
       VALUES (
         $1, $2::varchar, $3::varchar,
         (SELECT COALESCE(MAX(agenda_revision), 0) + 1
          FROM world_engine_agenda_snapshots
          WHERE session_id = $2::varchar),
         $4::jsonb
       )`,
      [runId, args.payload.sessionId, args.payload.userId, JSON.stringify(snapshot)]
    );

    const wr = await client.query<{ world_revision: string }>(
      `INSERT INTO vc_world_meta (id, world_revision)
       VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE
       SET world_revision = vc_world_meta.world_revision + 1
       RETURNING world_revision::text AS world_revision`
    );
    const worldRevision = BigInt(wr.rows[0]?.world_revision ?? "0");

    const acceptedCodes = new Set(args.validation.acceptedEventCodes);
    const agendaEvents =
      args.delta.agenda_write_allowed && args.validation.accepted
        ? args.delta.world_events_to_schedule.filter((ev) => acceptedCodes.has(ev.event_code))
        : [];
    const agendaResult = await insertDirectorAgendaItems({
      runId,
      sessionId: args.payload.sessionId,
      userId: args.payload.userId,
      turnIndex: args.payload.turnIndex,
      dedupKey: args.payload.dedupKey,
      risk: args.delta.risk_assessment,
      revealPolicy: args.delta.reveal_policy,
      events: agendaEvents,
      client,
    }).catch(() => ({ created: 0, skipped: agendaEvents.length }));

    const nextState = computeNextDirectorState({
      previousState: args.previousDirectorState,
      plan: args.delta,
      sessionId: args.payload.sessionId,
      userId: args.payload.userId,
      turnIndex: args.payload.turnIndex,
      worldRevision,
    });
    await saveDirectorState(nextState, client);

    await client.query("COMMIT");

    const redis = await getAppRedisClient();
    if (redis) {
      void redis
        .set(
          `vc:we:agenda:${args.payload.sessionId}`,
          JSON.stringify({
            ...snapshot,
            agenda_created: agendaResult.created,
            director_state: nextState,
          }),
          { EX: 3600 }
        )
        .catch(() => {});
    }
    return {
      runId,
      worldRevision,
      agendaCreated: agendaResult.created,
      agendaSkipped: agendaResult.skipped,
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.warn('[worldEngine] ROLLBACK failed in writeWorldEngineOutputs', {
        message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
      });
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function runWorldEngineTick(payload: WorldEngineTickPayload): Promise<
  | {
      ok: true;
      runId: number;
      worldRevision: bigint;
      agendaCreated: number;
      agendaSkipped: number;
    }
  | {
      ok: false;
      reason: string;
    }
> {
  const cfg = resolveWorldDirectorConfig();

  // Setup Langfuse tracing (fail-open)
  try {
    createTracingAdapter();
    startTurnTrace({
      requestId: payload.requestId,
      task: "world_director_tick",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      userIdHash: payload.userId ?? undefined,
      sessionIdHash: payload.sessionId,
      tags: [`mode:${cfg.mode}`, `triggers:${payload.triggerSignals.length}`],
    });
  } catch { /* fail-open */ }

  const tickStartedAt = Date.now();
  let tickOk = false;
  let tickReason = "";
  let tickRunId = 0;
  let tickWorldRevision = BigInt(0);
  let tickAgendaCreated = 0;
  let tickAgendaSkipped = 0;
  let tickValidatorIssueCount = 0;

  try {
    // LangGraph path: delegate to the graph-based orchestration
    if (cfg.enableLangGraph) {
      const stageSpan = startStageSpan({ name: "world_director.graph_run", status: "ok" });
      try {
        const { runWorldEngineTickGraph } = await import("@/lib/langgraph/worldDirectorGraph");
        const result = await runWorldEngineTickGraph(payload);
        if (result.status === "error") {
          tickReason = result.errorStage ?? "graph_error";
          stageSpan.setAttributes({ errorStage: tickReason });
        } else {
          tickOk = true;
          tickAgendaCreated = result.writeResult?.agendaCreated ?? 0;
          tickAgendaSkipped = result.writeResult?.agendaSkipped ?? 0;
          stageSpan.setAttributes({
            agendaCreated: tickAgendaCreated,
            agendaSkipped: tickAgendaSkipped,
          });
        }
      } finally {
        stageSpan.end();
      }
    } else if (!cfg.enabled) {
      tickOk = true;
    } else {
      // --- Legacy path ---
      const socialCfg = resolveSocialWorldConfig();

      // Stage 1: load_context
      const loadSpan = startStageSpan({ name: "world_director.load_context", status: "ok" });
      const loadStartedAt = Date.now();
      const [recentFacts, recentAgenda, directorState, socialNpcStates, pendingSocialEventCount, recentSocialEvents] =
        await Promise.all([
        loadRecentWorldFacts(payload.userId, payload.sessionId),
        loadRecentAgendaSummary(payload.sessionId),
        loadDirectorState(payload.sessionId),
        socialCfg.backgroundEnabled ? loadNpcAgentStates(payload.sessionId).catch(() => []) : Promise.resolve([]),
        socialCfg.backgroundEnabled ? countPendingSocialEvents(payload.sessionId).catch(() => 0) : Promise.resolve(0),
        socialCfg.backgroundEnabled
          ? loadRecentSocialEventsForCooldown(
              payload.sessionId,
              payload.turnIndex,
              Math.max(0, socialCfg.minTriggerGapTurns - 1)
            ).catch(() => [])
          : Promise.resolve([]),
      ]);
      loadSpan.setAttributes({
        factsLoaded: recentFacts.length,
        agendaItemsLoaded: recentAgenda.length,
        hasDirectorState: directorState ? 1 : 0,
        latencyMs: Date.now() - loadStartedAt,
      });
      loadSpan.end();

      const socialHasTrigger = socialCfg.backgroundEnabled && shouldTriggerSocialTick(payload.triggerSignals);
      const socialPendingCapacityOk = pendingSocialEventCount < socialCfg.maxPendingEventsPerSession;
      const socialGapOk = socialCfg.minTriggerGapTurns <= 0 || recentSocialEvents.length === 0;
      const socialTickTriggered = socialCfg.backgroundEnabled && socialHasTrigger && socialPendingCapacityOk && socialGapOk;
      const socialTickSkippedReason = !socialCfg.enabled
        ? "off"
        : !socialCfg.backgroundEnabled
          ? "mode_off"
          : !socialHasTrigger
            ? "no_trigger"
            : !socialPendingCapacityOk
              ? "pending_limit"
              : !socialGapOk
                ? "min_gap"
                : null;
      const activeSocialNpcStates: NpcAgentState[] = socialTickTriggered
        ? selectActiveNpcsForSocialTick({
            npcStates: socialNpcStates,
            nowTurn: payload.turnIndex,
            desiredActiveNpcCount: socialCfg.maxActiveNpcs,
            budget: socialCfg.budget,
          })
        : [];
      const socialWorldContext: SocialWorldTickContext = {
        config: socialCfg,
        tickTriggered: socialTickTriggered,
        skipReason: socialTickSkippedReason,
        activeNpcIds: activeSocialNpcStates.map((state) => state.npcId),
        pendingEventCount: pendingSocialEventCount,
      };

      // Stage 2: build_messages
      const buildSpan = startStageSpan({ name: "world_director.build_messages", status: "ok" });
      const buildStartedAt = Date.now();
      let messages = buildWorldEngineMessages({ payload, recentFacts, recentAgenda, directorState, socialWorld: socialWorldContext });

      // Phase 3: Actor Simulation — 可选的后台 NPC 行动推演。
      // 仅在 VERSECRAFT_ENABLE_ACTOR_SIMULATION=true 且 mode≠off 时运行。
      // shadow 模式只记录 telemetry；soft 模式将推演上下文注入 reasoner prompt。
      let _actorSimTelemetry: Record<string, unknown> | null = null;
      try {
        const { runActorSimulationPhase, appendActorSimulationToMessages } = await import(
          "@/lib/worldEngine/actorSimulation/integration"
        );
        const actorCtx: ActorSimulationContext & {
          aiCtx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
          signal?: AbortSignal;
        } = {
          npcStates: activeSocialNpcStates.length > 0
            ? activeSocialNpcStates
            : socialNpcStates.slice(0, 3),
          turnIndex: payload.turnIndex,
          sceneNpcIds: activeSocialNpcStates.map((s) => s.npcId),
          playerMentionedNpcIds: [],
          worldFacts: recentFacts.map((fact, i) => ({
            id: `fact_${i}`,
            summary: typeof fact === "string" ? fact.slice(0, 200) : String(fact).slice(0, 200),
            revealTier: 1,
            category: "world",
            sourceId: `src_${i}`,
          })),
          relationEdges: [],
          epistemicIndex: {
            knownFactIdsByNpc: new Map(),
            suspectedFactIdsByNpc: new Map(),
            forbiddenFactIds: new Set(),
          },
          aiCtx: {
            requestId: payload.requestId,
            userId: payload.userId,
            sessionId: payload.sessionId,
            path: "/worker/world-engine",
            tags: { purpose: "actor_simulation", mode: cfg.mode },
          },
          signal: undefined,
        };
        const simResult = await runActorSimulationPhase(actorCtx);
        _actorSimTelemetry = simResult.telemetry as unknown as Record<string, unknown>;
        if (simResult.reasonerContextHint) {
          messages = appendActorSimulationToMessages(messages, simResult.reasonerContextHint);
        }
      } catch {
        // Actor simulation is optional; failures must not block the world tick
      }

      buildSpan.setAttributes({
        messageCount: messages.length,
        socialTickTriggered: socialTickTriggered ? 1 : 0,
        actorSimRan: _actorSimTelemetry ? 1 : 0,
        latencyMs: Date.now() - buildStartedAt,
      });
      buildSpan.end();

      // Stage 3: run_reasoner
      const reasonerSpan = startStageSpan({ name: "world_director.run_reasoner", status: "ok" });
      const reasonerStartedAt = Date.now();
      // 试点开关：tool loop 版导演推理（只读检索工具，有界轮数）；默认走原单次 reasoner 路径。
      const res = cfg.toolLoopEnabled
        ? await runWorldDirectorReasonerWithTools({
            messages,
            requestId: payload.requestId,
            userId: payload.userId,
            sessionId: payload.sessionId,
            mode: cfg.mode,
          })
        : await runOfflineReasonerTask({
            kind: "worldbuild",
            messages,
            ctx: {
              requestId: payload.requestId,
              userId: payload.userId,
              sessionId: payload.sessionId,
              path: "/worker/world-engine",
              tags: { purpose: "world_director", mode: cfg.mode },
            },
            requestTimeoutMs: 45_000,
            skipCache: true,
            extraBody: {
              enable_thinking: false,
              thinking: { type: "disabled" },
            },
            devOverrides: {
              responseFormatJsonObject: true,
              temperature: 0.2,
              maxTokens: 2048,
            },
          });
      const socialReasonerLatencyMs = socialTickTriggered ? Math.max(0, Date.now() - reasonerStartedAt) : 0;
      if (!res.ok) {
        void recordGenericAnalyticsEvent({
          eventId: `${payload.requestId}:reasoner_failed`,
          idempotencyKey: `${payload.requestId}:reasoner_failed`,
          userId: payload.userId,
          sessionId: payload.sessionId,
          eventName: "world_engine_reasoner_failed",
          eventTime: new Date(),
          page: null,
          source: "world_engine",
          platform: "unknown",
          tokenCost: 0,
          playDurationDeltaSec: 0,
          payload: {
            reason: res.code,
            durationMs: Date.now() - reasonerStartedAt,
            mode: cfg.mode,
            hasSocialTick: socialTickTriggered,
            code: res.code,
            triggerSignals: payload.triggerSignals,
          },
        }).catch(() => {});
        tickReason = `reasoner_failed:${res.code}`;
        reasonerSpan.setAttributes({ errorCode: res.code, latencyMs: Date.now() - reasonerStartedAt });
        reasonerSpan.end();
      } else {
        reasonerSpan.setAttributes({
          latencyMs: Date.now() - reasonerStartedAt,
          toolLoopEnabled: cfg.toolLoopEnabled ? 1 : 0,
        });
        reasonerSpan.end();

        // Stage 4: validate (parse + validator + critic)
        const validateSpan = startStageSpan({ name: "world_director.validate", status: "ok" });
        const validateStartedAt = Date.now();

        const parsed = parseWorldEngineDeltaJson(res.content ?? "");
        if (!parsed) {
          void recordGenericAnalyticsEvent({
            eventId: `${payload.requestId}:parse_failed`,
            idempotencyKey: `${payload.requestId}:parse_failed`,
            userId: payload.userId,
            sessionId: payload.sessionId,
            eventName: "world_engine_parse_failed",
            eventTime: new Date(),
            page: null,
            source: "world_engine",
            platform: "unknown",
            tokenCost: 0,
            playDurationDeltaSec: 0,
            payload: {
              reason: "reasoner_invalid_json",
              durationMs: Date.now() - validateStartedAt,
              mode: cfg.mode,
              hasSocialTick: socialTickTriggered,
              contentPreview: (res.content ?? "").slice(0, 200),
              triggerSignals: payload.triggerSignals,
            },
          }).catch(() => {});
          tickReason = "reasoner_invalid_json";
          validateSpan.setAttributes({ errorCode: "parse_failed", latencyMs: Date.now() - validateStartedAt });
          validateSpan.end();
        } else {
          const deterministicValidation = validateDirectorPlan(parsed);

          // 诊断告警：模型确实提议了 world_events 但全部被 validator 拒绝。
          // 这解释了 production 中 world_events_to_schedule 持续为零的原因。
          if (
            parsed.world_events_raw_count > 0 &&
            deterministicValidation.acceptedEventCodes.length === 0
          ) {
            const rejectionReasons = deterministicValidation.issues
              .filter((i) => i.eventCode)
              .map((i) => ({ code: i.code, message: i.message, severity: i.severity, eventCode: i.eventCode }));
            const planLevelReasons = deterministicValidation.issues
              .filter((i) => !i.eventCode)
              .map((i) => ({ code: i.code, message: i.message, severity: i.severity }));
            console.warn("[worldEngine] all world_events rejected by validator", {
              raw_count: parsed.world_events_raw_count,
              accepted_event_codes: deterministicValidation.acceptedEventCodes.length,
              rejected_event_codes: deterministicValidation.rejectedEventCodes.length,
              first3_rejection_reasons: rejectionReasons.slice(0, 3),
              plan_level_issues: planLevelReasons,
            });
          }

          if (!deterministicValidation.accepted) {
            void recordGenericAnalyticsEvent({
              eventId: `${payload.requestId}:validation_failed`,
              idempotencyKey: `${payload.requestId}:validation_failed`,
              userId: payload.userId,
              sessionId: payload.sessionId,
              eventName: "world_engine_validation_failed",
              eventTime: new Date(),
              page: null,
              source: "world_engine",
              platform: "unknown",
              tokenCost: 0,
              playDurationDeltaSec: 0,
              payload: {
                reason: "deterministic_validation_rejected",
                durationMs: Date.now() - validateStartedAt,
                mode: cfg.mode,
                hasSocialTick: socialTickTriggered,
                issues: deterministicValidation.issues.map((i) => ({ code: i.code, severity: i.severity })),
                rejectedEventCodes: deterministicValidation.rejectedEventCodes,
                triggerSignals: payload.triggerSignals,
              },
            }).catch(() => {});
          }
          tickValidatorIssueCount = deterministicValidation.issues.length;

          const validation = await runOptionalCritic({
            payload,
            plan: parsed,
            recentFacts,
            validation: deterministicValidation,
          });

          const socialGm =
            socialTickTriggered && parsed.social_events_to_schedule.length > 0
              ? await applySocialGmDeltas({
                  sessionId: payload.sessionId,
                  userId: payload.userId,
                  turnIndex: payload.turnIndex,
                  dedupKey: payload.dedupKey,
                  playerLocationId: payload.playerLocation,
                  directorSocialEvents: parsed.social_events_to_schedule,
                  npcRelationDeltas: parsed.npc_relation_deltas,
                  npcAgentPatches: parsed.npc_agent_patches,
                  riskAssessment: parsed.risk_assessment,
                  acceptedSocialEventCodes: validation.acceptedSocialEventCodes,
                  budget: socialCfg.budget,
                  cooldownTurns: Math.max(0, socialCfg.minTriggerGapTurns - 1),
                  maxPendingEventsPerSession: socialCfg.maxPendingEventsPerSession,
                }).catch((error) => ({
                  acceptedEvents: [],
                  rejectedEvents: [],
                  issues: [
                    {
                      code: "social_gm_failed_open",
                      severity: "warning" as const,
                      message: error instanceof Error ? error.message : "Social GM failed open.",
                    },
                  ],
                  acceptedEventCodes: [],
                  rejectedEventCodes: parsed.social_events_to_schedule.map((event) => event.event_code),
                  eventWrite: { inserted: 0, updated: 0, skipped: 0 },
                  relationWrite: { inserted: 0, updated: 0, skipped: 0 },
                  agentWrite: { inserted: 0, updated: 0, skipped: 0 },
                  memoryWrite: { inserted: 0, updated: 0, skipped: 0 },
                  memorySpineEntries: [],
                }))
              : null;
          const suppressedSocialEventCount = socialTickTriggered ? 0 : parsed.social_events_to_schedule.length;
          const socialTelemetry: SocialWorldTelemetry = {
            socialWorldMode: socialCfg.mode,
            socialTickTriggered,
            socialActiveNpcCount: activeSocialNpcStates.length,
            socialEventsAccepted: socialGm?.acceptedEventCodes.length ?? 0,
            socialEventsRejected: (socialGm?.rejectedEventCodes.length ?? 0) + suppressedSocialEventCount,
            socialPromptChars: 0,
            socialQueryLatencyMs: 0,
            socialReasonerLatencyMs,
            socialRejectedByCode:
              suppressedSocialEventCount > 0 && !socialGm
                ? { [socialTickSkippedReason ?? "social_tick_disabled"]: suppressedSocialEventCount }
                : socialRejectedByCode(socialGm),
            socialProjectionSkippedReason: socialCfg.promptInjectionEnabled ? null : "disabled",
            socialPendingEventCount: pendingSocialEventCount,
            socialTickSkippedReason,
          };

          validateSpan.setAttributes({
            accepted: validation.accepted ? 1 : 0,
            eventCodesAccepted: validation.acceptedEventCodes.length,
            eventCodesRejected: validation.rejectedEventCodes.length,
            issues: validation.issues.length,
            criticRan: cfg.criticEnabled ? 1 : 0,
            latencyMs: Date.now() - validateStartedAt,
          });
          validateSpan.end();

          // Stage 5: write_outputs
          const writeSpan = startStageSpan({ name: "world_director.write_outputs", status: "ok" });
          const writeStartedAt = Date.now();

          const out = await writeWorldEngineOutputs({
            payload,
            delta: parsed,
            validation,
            socialGm,
            socialTelemetry,
            previousDirectorState: directorState,
          });

          writeSpan.setAttributes({
            runId: out.runId,
            worldRevision: Number(out.worldRevision),
            agendaCreated: out.agendaCreated,
            agendaSkipped: out.agendaSkipped,
            latencyMs: Date.now() - writeStartedAt,
          });
          writeSpan.end();

          tickOk = true;
          tickRunId = out.runId;
          tickWorldRevision = out.worldRevision;
          tickAgendaCreated = out.agendaCreated;
          tickAgendaSkipped = out.agendaSkipped;
        }
      }
    }
  } finally {
    try {
      endTurnTrace({
        finalJsonParsed: true,
        turnCommitted: tickOk,
        narrativeCharLen: 0,
        optionsCount: 0,
        fallbackUsed: false,
        degradedMode: false,
        validatorIssueCount: tickValidatorIssueCount,
        npcConsistencyIssueCount: 0,
        finalMs: Date.now() - tickStartedAt,
      });
    } catch { /* fail-open */ }
  }

  if (!tickOk) return { ok: false, reason: tickReason };
  return {
    ok: true,
    runId: tickRunId,
    worldRevision: tickWorldRevision,
    agendaCreated: tickAgendaCreated,
    agendaSkipped: tickAgendaSkipped,
  };
}
