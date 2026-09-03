import { pool } from "@/db/index";
import type { ChatMessage } from "@/lib/ai/types/core";
import { createTracingAdapter, startTurnTrace, startStageSpan, endTurnTrace } from "@/lib/observability/langfuse";
import { getLangfuseConfig } from "@/lib/observability/langfuse/config";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import {
  applySocialGmDeltas,
  type ApplySocialGmDeltasArgs,
  type SocialGmApplyResult,
} from "@/lib/socialWorld/applyDeltas";
import { selectActiveNpcsForSocialTick } from "@/lib/socialWorld/activation";
import { resolveSocialWorldConfig, type SocialWorldConfig } from "@/lib/socialWorld/config";
import {
  countPendingSocialEvents,
  loadNpcAgentStates,
  loadNpcRelationEdges,
  loadRecentSocialEventsForCooldown,
} from "@/lib/socialWorld/persistence";
import type { NpcAgentState } from "@/lib/socialWorld/types";
import { insertDirectorAgendaItems } from "./agenda";
import { resolveWorldCapabilityMode, resolveWorldDirectorConfig } from "./config";
import {
  parseWorldEngineDeltaJson,
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
import { validateChapterPacingPlan, type DirectorValidationResult } from "./validator";
import { enforceChapterPacingPlan } from "./directorEnforcer";
import {
  applyWorldCapabilitySafetyDefaults,
  getWorldDirectorCapabilityProfile,
  validateChapterPacingPlanCapabilities,
} from "./directorCapabilities";
import { buildXingniActorContext } from "./xingniActorContext";
import { buildDarkMoonActorContext } from "./darkMoonActorContext";
import { materializeAcceptedChapterPacingPlan } from "./acceptedPlan";
import { projectDirectorPlanV2 } from "./directorPlanV2";
import { projectActorContext } from "./actorContextProjector";
import { runWorldDirectorWorkflow } from "./worldDirectorWorkflow";

export async function loadRecentWorldFacts(
  userId: string | null,
  scope: Pick<WorldEngineTickPayload, "worldId" | "mapId" | "sessionId">,
): Promise<string[]> {
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
      `SELECT f.raw_fact
       FROM world_player_facts f
       WHERE f.user_id = $1 AND f.session_id = $2
         AND EXISTS (
           SELECT 1
           FROM world_knowledge_chunks c
           WHERE c.entity_id = f.entity_id
             AND c.world_id = $3
             AND (c.map_id = $4 OR (c.map_id IS NULL AND $3 = 'dark_moon_prologue' AND $4 = 'dark_moon_apartment'))
         )
       ORDER BY f.id DESC
       LIMIT 24`,
      [userId, scope.sessionId, scope.worldId, scope.mapId]
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

export async function loadRecentAgendaSummary(scope: Pick<WorldEngineTickPayload, "worldId" | "mapId" | "sessionId">): Promise<Array<Record<string, unknown>>> {
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
       WHERE world_id = $1 AND map_id = $2 AND session_id = $3
       ORDER BY id DESC
       LIMIT 16`,
      [scope.worldId, scope.mapId, scope.sessionId]
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
  const kinds = new Set(input.latestTurnSignals.actionKinds);
  return {
    exploration: kinds.has("exploration"),
    dialogue: kinds.has("dialogue"),
    confrontation: kinds.has("confrontation"),
    repeated_investigation_hint: input.triggerSignals.includes("repeated_investigation_loop"),
    movement_changed:
      Boolean(input.playerLocationBefore?.trim()) &&
      Boolean(input.playerLocationAfter?.trim()) &&
      input.playerLocationBefore?.trim() !== input.playerLocationAfter?.trim(),
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

type EstablishedDirectorRun = {
  runId: number;
  status: "running" | "succeeded" | "failed";
  worldRevision: bigint;
  agendaCreated: number;
  agendaSkipped: number;
};

async function establishDirectorRun(payload: WorldEngineTickPayload): Promise<EstablishedDirectorRun> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO world_engine_runs (
         world_id, map_id, dedup_key, request_id, user_id, session_id,
         trigger_signals, model_task, status, output_json, error_message
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'WORLDBUILD_OFFLINE', 'running', NULL, NULL)
       ON CONFLICT (world_id, map_id, session_id, dedup_key) DO NOTHING`,
      [payload.worldId, payload.mapId, payload.dedupKey, payload.requestId, payload.userId, payload.sessionId, JSON.stringify(payload.triggerSignals)],
    );
    const result = await client.query<{
      run_id: string;
      status: EstablishedDirectorRun["status"];
      output_json: Record<string, unknown> | null;
    }>(
      `SELECT run_id::text, status, output_json
       FROM world_engine_runs
       WHERE world_id = $1 AND map_id = $2 AND session_id = $3 AND dedup_key = $4
       LIMIT 1`,
      [payload.worldId, payload.mapId, payload.sessionId, payload.dedupKey],
    );
    const row = result.rows[0];
    const runId = Number(row?.run_id ?? 0);
    if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error("world_engine_run_not_persisted");
    if (row?.status === "failed") {
      await client.query(
        `UPDATE world_engine_runs SET status = 'running', error_message = NULL, updated_at = NOW() WHERE run_id = $1`,
        [runId],
      );
    }
    const output = row?.output_json ?? {};
    return {
      runId,
      status: row?.status === "succeeded" ? "succeeded" : "running",
      worldRevision: BigInt(String(output.world_revision ?? 0)),
      agendaCreated: Number(output.agenda_created ?? 0),
      agendaSkipped: Number(output.agenda_skipped ?? 0),
    };
  } finally {
    client.release();
  }
}

async function markDirectorRunFailed(runId: number, reason: string): Promise<void> {
  if (!runId) return;
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE world_engine_runs SET status = 'failed', error_message = $2, updated_at = NOW()
       WHERE run_id = $1 AND status = 'running'`,
      [runId, reason.slice(0, 1000)],
    );
  } finally {
    client.release();
  }
}

export function buildWorldEngineMessages(input: {
  payload: WorldEngineTickPayload;
  recentFacts: string[];
  recentAgenda: Array<Record<string, unknown>>;
  directorState: WorldDirectorState | null;
  socialWorld: SocialWorldTickContext;
}): ChatMessage[] {
  const isXingni = input.payload.worldId === "xingni_taichu";
  const socialPolicy = !isXingni && input.socialWorld.tickTriggered
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
  const worldScopePolicy = isXingni
    ? [
        "【世界作用域】本轮只属于《星逆·太初》的青石县，不得引用暗月、公寓、B1/B2、原石、污染、异常规则或暗月人物。",
        "【确定性内容】只可使用 capability_profile 中登记的青石县地点、NPC、日程、任务阶段、微事件与世界状态；不得创建新事实、敌人、物品、配方、任务真相、境界、奖励与出口。",
        "【登记 ID】event_code、payload.event_id 与 npc_code 必须逐字复制 capability_profile 对应 registered_*_ids 中的完整值；禁止递增、猜测、补造或改写 ID。没有合适登记项时必须返回空数组。",
        "星逆可提出已登记 NPC 的候选行动和已登记微事件；social_events_to_schedule、story_branch_seeds、player_private_hooks 必须为空数组，且不得直接结算任务或进阶。",
      ]
    : ["【世界作用域】本轮属于序章·暗月；不得引用星逆·太初、青石县、灵石、灵根或修仙境界。"];
  const system = [
    ...socialPolicy,
    ...worldScopePolicy,
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
      world_scope: {
        world_id: input.payload.worldId ?? "dark_moon_prologue",
        map_id: input.payload.mapId ?? "dark_moon_apartment",
      },
      turn_index: input.payload.turnIndex,
      trigger_signals: input.payload.triggerSignals,
      control_risk_tags_for_assessment_only: input.payload.controlRiskTags,
      structured_turn_signals: input.payload.latestTurnSignals,
      player_location: input.payload.playerLocationAfter,
      previous_player_location: input.payload.playerLocationBefore,
      present_npc_ids: input.payload.presentNpcIds,
      dead_npc_ids: input.payload.deadNpcIds,
      changed_task_ids: input.payload.changedTaskIds,
      changed_clue_ids: input.payload.changedClueIds,
      pacing_chapter_signals: input.payload.pacingChapterSignals,
      world_state_summary: input.payload.worldStateSummary,
      npc_location_update_count: input.payload.npcLocationUpdateCount,
      recent_facts: input.recentFacts.slice(0, 24),
      recent_agenda: input.recentAgenda.slice(0, 16),
      current_director_state: input.directorState
        ? {
            phase: input.directorState.phase,
            pacing: input.directorState.pacing,
            recent_director_intent: isXingni ? null : input.directorState.recentDirectorIntent,
            world_revision: isXingni ? null : input.directorState.worldRevision,
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
        social_event_count_max: !isXingni && input.socialWorld.tickTriggered ? input.socialWorld.config.maxEventsPerTick : 0,
        npc_relation_delta_count_max: 12,
        npc_agent_patch_count_max: 8,
        npc_action_count_max: 6,
        prefer_reveal_policy_near_truth: "hint_only",
        agency_rule: "If a player action can reasonably avoid an event, the plan must allow avoidance.",
        social_event_rule:
          "Social events are candidates only; include knowledge_scope and must_not_reveal; never force player failure.",
        ...(isXingni
          ? {
              capability_profile: {
                registered_npc_ids: [...(getWorldDirectorCapabilityProfile(input.payload)?.registeredNpcIds ?? [])].slice(0, 48),
                registered_location_ids: [...(getWorldDirectorCapabilityProfile(input.payload)?.registeredLocationIds ?? [])].slice(0, 48),
                registered_event_ids: [...(getWorldDirectorCapabilityProfile(input.payload)?.registeredEventIds ?? [])].slice(0, 48),
                registered_task_ids: [...(getWorldDirectorCapabilityProfile(input.payload)?.registeredTaskIds ?? [])].slice(0, 64),
                allowed_action_codes: [...(getWorldDirectorCapabilityProfile(input.payload)?.allowedActionCodes ?? [])].slice(0, 32),
                forbidden_capability_codes: [...(getWorldDirectorCapabilityProfile(input.payload)?.forbiddenCapabilityCodes ?? [])].slice(0, 32),
              },
              registered_id_rule: "Copy IDs exactly from capability_profile; if no registered candidate fits, emit an empty array instead of inventing an ID.",
            }
          : {}),
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

export async function writeWorldEngineOutputs(args: {
  runId: number;
  mode: "shadow" | "soft";
  payload: WorldEngineTickPayload;
  delta: WorldEngineStructuredDelta;
  validation: DirectorValidationResult;
  socialGmInput: Omit<ApplySocialGmDeltasArgs, "client"> | null;
  socialTelemetry: SocialWorldTelemetry;
  previousDirectorState: WorldDirectorState | null;
}): Promise<{ runId: number; worldRevision: bigint; agendaCreated: number; agendaSkipped: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const socialGm = args.socialGmInput
      ? await applySocialGmDeltas({ ...args.socialGmInput, client })
      : null;
    const socialTelemetry: SocialWorldTelemetry = {
      ...args.socialTelemetry,
      socialEventsAccepted: socialGm?.acceptedEventCodes.length ?? 0,
      socialEventsRejected:
        args.socialTelemetry.socialEventsRejected + (socialGm?.rejectedEventCodes.length ?? 0),
      socialRejectedByCode: socialGm ? socialRejectedByCode(socialGm) : args.socialTelemetry.socialRejectedByCode,
    };
    const committedPlan = materializeAcceptedChapterPacingPlan({
      plan: args.delta,
      validation: args.validation,
      acceptedSocialEventCodes: socialGm?.acceptedEventCodes ?? [],
    });
    const directorPlanV2 = committedPlan
      ? projectDirectorPlanV2({
          plan: committedPlan,
          turnIndex: args.payload.turnIndex,
          chapterId: args.payload.pacingChapterSignals.chapterId,
        })
      : null;
    const validationOutput = socialGm
      ? {
          ...args.validation,
          social_world: socialTelemetry,
          social_gm: {
            accepted_event_codes: socialGm.acceptedEventCodes,
            rejected_event_codes: socialGm.rejectedEventCodes,
            issues: socialGm.issues,
            writes: {
              events: socialGm.eventWrite,
              relations: socialGm.relationWrite,
              agents: socialGm.agentWrite,
              memory: socialGm.memoryWrite,
            },
          },
        }
      : {
          ...args.validation,
          social_world: socialTelemetry,
        };
    const runId = args.runId;
    if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error("invalid_world_engine_run_id");

    const wr = await client.query<{ world_revision: string }>(
      `INSERT INTO vc_world_meta (id, world_revision)
       VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE
       SET world_revision = vc_world_meta.world_revision + 1
       RETURNING world_revision::text AS world_revision`
    );
    const worldRevision = BigInt(wr.rows[0]?.world_revision ?? "0");

    const agendaEvents =
      args.mode === "soft" && committedPlan?.agenda_write_allowed
        ? committedPlan.world_events_to_schedule
        : [];
    const agendaResult = await insertDirectorAgendaItems({
      worldId: args.payload.worldId,
      mapId: args.payload.mapId,
      runId,
      sessionId: args.payload.sessionId,
      userId: args.payload.userId,
      turnIndex: args.payload.turnIndex,
      dedupKey: args.payload.dedupKey,
      risk: args.delta.risk_assessment,
      revealPolicy: args.delta.reveal_policy,
      events: agendaEvents,
      client,
    });

    const nextState = committedPlan ? computeNextDirectorState({
      previousState: args.previousDirectorState,
      plan: committedPlan,
      scope: {
        worldId: args.payload.worldId,
        mapId: args.payload.mapId,
        sessionId: args.payload.sessionId,
      },
      userId: args.payload.userId,
      turnIndex: args.payload.turnIndex,
      worldRevision,
    }) : null;
    if (args.mode === "soft" && nextState) await saveDirectorState(nextState, client);

    await client.query(
      `UPDATE world_engine_runs
       SET status = 'succeeded', output_json = $2::jsonb, error_message = NULL, updated_at = NOW()
      WHERE run_id = $1`,
      [runId, JSON.stringify({
        ...(committedPlan ?? {}),
        director_plan_v2: directorPlanV2,
        validation: validationOutput,
        agenda_write_allowed: Boolean(committedPlan?.agenda_write_allowed),
        world_revision: worldRevision.toString(),
        agenda_created: agendaResult.created,
        agenda_skipped: agendaResult.skipped,
        directive_projection: "current_state_plus_due_agenda",
      })],
    );

    await client.query("COMMIT");

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
      skipped: true;
      reason: "director_disabled" | "world_capability_off_or_missing";
    }
  | {
      ok: true;
      skipped?: false;
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
  const isXingniTick = payload.worldId === "xingni_taichu";

  // Setup Langfuse tracing (fail-open)
  try {
    createTracingAdapter();
    startTurnTrace({
      requestId: payload.requestId,
      task: "world_director_tick",
      environment: getLangfuseConfig().environment,
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
  let establishedRunId = 0;

  try {
    if (!cfg.enabled) {
      tickOk = true;
      return { ok: true, skipped: true, reason: "director_disabled" };
    } else {
      const baseCapabilityProfile = getWorldDirectorCapabilityProfile(payload);
      const capabilityProfile = baseCapabilityProfile
        ? { ...baseCapabilityProfile, mode: resolveWorldCapabilityMode(payload.worldId) }
        : null;
      if (!capabilityProfile || capabilityProfile.mode === "off") {
        tickReason = "world_capability_off_or_missing";
        tickOk = true;
        return { ok: true, skipped: true, reason: "world_capability_off_or_missing" };
      }
      const established = await establishDirectorRun(payload);
      establishedRunId = established.runId;
      if (established.status === "succeeded" && established.worldRevision > BigInt(0)) {
        return {
          ok: true,
          runId: established.runId,
          worldRevision: established.worldRevision,
          agendaCreated: established.agendaCreated,
          agendaSkipped: established.agendaSkipped,
        };
      }
      const socialCfg = resolveSocialWorldConfig();

      // Stage 1: load_context
      const loadSpan = startStageSpan({ name: "world_director.load_context", status: "ok" });
      const loadStartedAt = Date.now();
      const [recentFacts, recentAgenda, directorState, socialNpcStates, socialRelationEdges, pendingSocialEventCount, recentSocialEvents] =
        await Promise.all([
        loadRecentWorldFacts(payload.userId, payload),
        loadRecentAgendaSummary(payload),
        loadDirectorState(payload),
        !isXingniTick ? loadNpcAgentStates(payload.sessionId).catch(() => []) : Promise.resolve([]),
        !isXingniTick ? loadNpcRelationEdges(payload.sessionId).catch(() => []) : Promise.resolve([]),
        !isXingniTick && socialCfg.backgroundEnabled ? countPendingSocialEvents(payload.sessionId).catch(() => 0) : Promise.resolve(0),
        !isXingniTick && socialCfg.backgroundEnabled
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

      const socialHasTrigger = !isXingniTick && socialCfg.backgroundEnabled && shouldTriggerSocialTick(payload.triggerSignals);
      const socialPendingCapacityOk = pendingSocialEventCount < socialCfg.maxPendingEventsPerSession;
      const socialGapOk = socialCfg.minTriggerGapTurns <= 0 || recentSocialEvents.length === 0;
      const socialTickTriggered = !isXingniTick && socialCfg.backgroundEnabled && socialHasTrigger && socialPendingCapacityOk && socialGapOk;
      const socialTickSkippedReason = isXingniTick
        ? "world_scope_pacing_only"
        : !socialCfg.enabled
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
      const messages = buildWorldEngineMessages({ payload, recentFacts, recentAgenda, directorState, socialWorld: socialWorldContext });

      // ActorContextProjector is deterministic and subtractive. Actor state is
      // included in the single Director call instead of invoking a second model.
      const scopedActorContext = isXingniTick
        ? buildXingniActorContext({
            presentNpcIds: payload.presentNpcIds,
            deadNpcIds: payload.deadNpcIds,
            turnIndex: payload.turnIndex,
          })
        : buildDarkMoonActorContext({
            npcStates: socialNpcStates,
            relationEdges: socialRelationEdges,
            presentNpcIds: payload.presentNpcIds,
            deadNpcIds: payload.deadNpcIds,
            turnIndex: payload.turnIndex,
          });
      const actorProjection = projectActorContext({
        worldId: payload.worldId,
        turnIndex: payload.turnIndex,
        presentNpcIds: payload.presentNpcIds,
        deadNpcIds: payload.deadNpcIds,
        npcStates: scopedActorContext.npcStates,
        relationEdges: socialRelationEdges,
      });
      if (actorProjection.actors.length > 0) {
        let lastUserIndex = -1;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index]?.role === "user") {
            lastUserIndex = index;
            break;
          }
        }
        if (lastUserIndex >= 0) {
          messages[lastUserIndex] = {
            ...messages[lastUserIndex],
            content: `${messages[lastUserIndex].content}\n\nactor_context_projection=${actorProjection.promptBlock}`,
          };
        }
      }

      buildSpan.setAttributes({
        messageCount: messages.length,
        socialTickTriggered: socialTickTriggered ? 1 : 0,
        actorProjectionCount: actorProjection.actors.length,
        latencyMs: Date.now() - buildStartedAt,
      });
      buildSpan.end();

      // Stage 3: run_reasoner
      const reasonerSpan = startStageSpan({ name: "world_director.run_reasoner", status: "ok" });
      const reasonerStartedAt = Date.now();
      const res = await runWorldDirectorWorkflow({
        messages,
        requestId: payload.requestId,
        userId: payload.userId,
        sessionId: payload.sessionId,
        worldId: payload.worldId,
        mapId: payload.mapId,
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
          modelCalls: 1,
          outputTokens: res.actualUsage.usage?.completionTokens ?? 0,
        });
        reasonerSpan.end();

        // Stage 4: deterministic parse, validate and subtractive enforcement.
        const validateSpan = startStageSpan({ name: "world_director.validate", status: "ok" });
        const validateStartedAt = Date.now();

        const parsedCandidate = parseWorldEngineDeltaJson(res.content ?? "");
        const directorActualTokens = Math.max(0, res.actualUsage.usage?.totalTokens ?? 0);
        if (!parsedCandidate) {
          if (directorActualTokens > 0) void recordGenericAnalyticsEvent({
            eventId: `${payload.requestId}:parse_failed`,
            idempotencyKey: `${payload.requestId}:parse_failed`,
            userId: payload.userId,
            sessionId: payload.sessionId,
            eventName: "world_engine_parse_failed",
            eventTime: new Date(),
            page: null,
            source: "world_engine",
            platform: "unknown",
            tokenCost: directorActualTokens,
            playDurationDeltaSec: 0,
            payload: {
              reason: "reasoner_invalid_json",
              durationMs: Date.now() - validateStartedAt,
              mode: cfg.mode,
              hasSocialTick: socialTickTriggered,
              triggerSignals: payload.triggerSignals,
              usage: res.actualUsage,
            },
          }).catch(() => {});
          tickReason = "reasoner_invalid_json";
          validateSpan.setAttributes({ errorCode: "parse_failed", latencyMs: Date.now() - validateStartedAt });
          validateSpan.end();
        } else {
          // Fixed authority order: normalize(parse) -> validate -> enforce ->
          // world capability gate. A second validation materializes the exact
          // subtractive accepted set passed to persistence.
          const scopedCandidate = applyWorldCapabilitySafetyDefaults(parsedCandidate, capabilityProfile);
          const initialValidation = validateChapterPacingPlan(scopedCandidate);
          const enforced = enforceChapterPacingPlan(scopedCandidate, {
            currentPhase: directorState?.phase,
            activeNpcIds: payload.presentNpcIds.length > 0
              ? payload.presentNpcIds
              : capabilityProfile.registeredNpcIds,
            deadOrInactiveNpcIds: payload.deadNpcIds,
          });
          const capabilityResult = validateChapterPacingPlanCapabilities(
            { ...scopedCandidate, ...enforced.plan },
            capabilityProfile,
          );
          const parsed = capabilityResult.plan;
          const deterministicValidation = validateChapterPacingPlan(parsed);
          deterministicValidation.issues.push(
            ...initialValidation.issues,
            ...enforced.rejections.map((rejection) => ({
              code: `enforcer_${rejection.kind}`,
              message: rejection.reason,
              severity: "medium" as const,
              eventCode: rejection.itemCode,
            })),
            ...capabilityResult.reasons.map((reason) => ({
              code: "world_capability_reject",
              message: reason,
              severity: "high" as const,
            })),
          );

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
            if (directorActualTokens > 0) void recordGenericAnalyticsEvent({
              eventId: `${payload.requestId}:validation_failed`,
              idempotencyKey: `${payload.requestId}:validation_failed`,
              userId: payload.userId,
              sessionId: payload.sessionId,
              eventName: "world_engine_validation_failed",
              eventTime: new Date(),
              page: null,
              source: "world_engine",
              platform: "unknown",
              tokenCost: directorActualTokens,
              playDurationDeltaSec: 0,
              payload: {
                reason: "deterministic_validation_rejected",
                durationMs: Date.now() - validateStartedAt,
                mode: cfg.mode,
                hasSocialTick: socialTickTriggered,
                issues: deterministicValidation.issues.map((i) => ({ code: i.code, severity: i.severity })),
                rejectedEventCodes: deterministicValidation.rejectedEventCodes,
                triggerSignals: payload.triggerSignals,
                usage: res.actualUsage,
              },
            }).catch(() => {});
          }
          tickValidatorIssueCount = deterministicValidation.issues.length;

          const validation = deterministicValidation;

          const socialGmInput: Omit<ApplySocialGmDeltasArgs, "client"> | null =
            socialTickTriggered && parsed.social_events_to_schedule.length > 0
              ? {
                  sessionId: payload.sessionId,
                  userId: payload.userId,
                  turnIndex: payload.turnIndex,
                  dedupKey: payload.dedupKey,
                  playerLocationId: payload.playerLocationAfter,
                  directorSocialEvents: parsed.social_events_to_schedule,
                  npcRelationDeltas: parsed.npc_relation_deltas,
                  npcAgentPatches: parsed.npc_agent_patches,
                  riskAssessment: parsed.risk_assessment,
                  acceptedSocialEventCodes: validation.acceptedSocialEventCodes,
                  knownNpcIds: [...capabilityProfile.registeredNpcIds],
                  budget: socialCfg.budget,
                  cooldownTurns: Math.max(0, socialCfg.minTriggerGapTurns - 1),
                  maxPendingEventsPerSession: socialCfg.maxPendingEventsPerSession,
                }
              : null;
          const suppressedSocialEventCount = socialTickTriggered ? 0 : parsed.social_events_to_schedule.length;
          const socialTelemetry: SocialWorldTelemetry = {
            socialWorldMode: socialCfg.mode,
            socialTickTriggered,
            socialActiveNpcCount: activeSocialNpcStates.length,
            socialEventsAccepted: 0,
            socialEventsRejected: suppressedSocialEventCount,
            socialPromptChars: 0,
            socialQueryLatencyMs: 0,
            socialReasonerLatencyMs,
            socialRejectedByCode:
              suppressedSocialEventCount > 0 && !socialGmInput
                ? { [socialTickSkippedReason ?? "social_tick_disabled"]: suppressedSocialEventCount }
                : {},
            socialProjectionSkippedReason: socialCfg.promptInjectionEnabled ? null : "disabled",
            socialPendingEventCount: pendingSocialEventCount,
            socialTickSkippedReason,
          };

          validateSpan.setAttributes({
            accepted: validation.accepted ? 1 : 0,
            eventCodesAccepted: validation.acceptedEventCodes.length,
            eventCodesRejected: validation.rejectedEventCodes.length,
            issues: validation.issues.length,
            modelCriticCalls: 0,
            latencyMs: Date.now() - validateStartedAt,
          });
          validateSpan.end();

          // Stage 5: write_outputs
          const writeSpan = startStageSpan({ name: "world_director.write_outputs", status: "ok" });
          const writeStartedAt = Date.now();

          const out = await writeWorldEngineOutputs({
            runId: establishedRunId,
            mode: capabilityProfile.mode === "shadow" ? "shadow" : "soft",
            payload,
            delta: parsed,
            validation,
            socialGmInput,
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
  } catch (error) {
    tickReason = error instanceof Error ? error.message : String(error);
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

  if (!tickOk) {
    await markDirectorRunFailed(establishedRunId, tickReason || "world_engine_tick_failed").catch(() => {});
    return { ok: false, reason: tickReason || "world_engine_tick_failed" };
  }
  return {
    ok: true,
    runId: tickRunId,
    worldRevision: tickWorldRevision,
    agendaCreated: tickAgendaCreated,
    agendaSkipped: tickAgendaSkipped,
  };
}
