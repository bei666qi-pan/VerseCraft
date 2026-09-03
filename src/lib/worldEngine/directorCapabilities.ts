import { NPCS } from "@/lib/registry/npcs";
import { MAP_ROOMS } from "@/lib/registry/world";
import {
  QINGSHI_LOCATION_IDS,
  QINGSHI_NPCS,
} from "@/lib/worlds/xingni/qingshiContent";
import {
  QINGSHI_CREDENTIAL_QUESTS,
  QINGSHI_EVENTS,
  QINGSHI_MAIN_STAGES,
  QINGSHI_NPC_PROFILES,
  QINGSHI_REPEATABLES,
  QINGSHI_SIDE_QUESTS,
} from "@/lib/worlds/xingni/qingshiProductionContent";
import {
  DARK_MOON_MAP_ID,
  DARK_MOON_WORLD_ID,
  QINGSHI_MAP_ID,
  XINGNI_WORLD_ID,
  type MapId,
  type WorldId,
} from "@/lib/worlds/types";
import type { DirectorAgendaItem, DirectorNpcAction, WorldEngineStructuredDelta } from "./contracts";

export type WorldDirectorCapabilityMode = "off" | "shadow" | "soft";

export type WorldDirectorCapabilityProfile = {
  worldId: WorldId;
  mapId: MapId;
  mode: WorldDirectorCapabilityMode;
  capabilities: readonly string[];
  registeredNpcIds: ReadonlySet<string>;
  registeredLocationIds: ReadonlySet<string>;
  registeredFactIds: ReadonlySet<string>;
  registeredEventIds: ReadonlySet<string>;
  registeredTaskIds: ReadonlySet<string>;
  allowedActionCodes: ReadonlySet<string>;
  forbiddenCapabilityCodes: ReadonlySet<string>;
};

const COMMON_ACTOR_ACTIONS = new Set([
  "observe",
  "move",
  "patrol",
  "wait",
  "greet",
  "talk",
  "warn",
  "report",
  "investigate",
  "trade",
  "assist",
  "retreat",
]);

const darkMoonProfile: WorldDirectorCapabilityProfile = {
  worldId: DARK_MOON_WORLD_ID,
  mapId: DARK_MOON_MAP_ID,
  mode: "soft",
  capabilities: ["registry", "db_facts", "locations", "npcs", "events", "social_world"],
  registeredNpcIds: new Set(NPCS.map((npc) => npc.id)),
  registeredLocationIds: new Set(Object.values(MAP_ROOMS).flat()),
  registeredFactIds: new Set(),
  registeredEventIds: new Set(),
  registeredTaskIds: new Set(),
  allowedActionCodes: COMMON_ACTOR_ACTIONS,
  forbiddenCapabilityCodes: new Set(["xingni_progression", "xingni_reward", "xingni_quest_settlement"]),
};

const qingshiFactIds = Object.values(QINGSHI_NPC_PROFILES)
  .flatMap((profile) => profile.facts.map((fact) => fact.id));

const xingniProfile: WorldDirectorCapabilityProfile = {
  worldId: XINGNI_WORLD_ID,
  mapId: QINGSHI_MAP_ID,
  mode: "soft",
  capabilities: ["qingshi_locations", "qingshi_npcs", "npc_schedules", "task_stage", "micro_event", "world_state"],
  registeredNpcIds: new Set(QINGSHI_NPCS.map((npc) => npc.id)),
  registeredLocationIds: new Set(QINGSHI_LOCATION_IDS),
  registeredFactIds: new Set(qingshiFactIds),
  registeredEventIds: new Set(QINGSHI_EVENTS.map((event) => event.id)),
  registeredTaskIds: new Set([
    ...QINGSHI_MAIN_STAGES.map((stage) => stage.id),
    ...QINGSHI_CREDENTIAL_QUESTS.map((quest) => quest.id),
    ...QINGSHI_SIDE_QUESTS.map((quest) => quest.id),
    ...QINGSHI_REPEATABLES.map((quest) => quest.id),
  ]),
  allowedActionCodes: COMMON_ACTOR_ACTIONS,
  forbiddenCapabilityCodes: new Set([
    "create_fact",
    "create_enemy",
    "grant_reward",
    "change_realm",
    "settle_quest",
  ]),
};

export function getWorldDirectorCapabilityProfile(scope: {
  worldId: WorldId;
  mapId: MapId;
}): WorldDirectorCapabilityProfile | null {
  if (scope.worldId === DARK_MOON_WORLD_ID && scope.mapId === DARK_MOON_MAP_ID) return darkMoonProfile;
  if (scope.worldId === XINGNI_WORLD_ID && scope.mapId === QINGSHI_MAP_ID) return xingniProfile;
  return null;
}

export type CapabilityValidationResult = {
  accepted: boolean;
  plan: WorldEngineStructuredDelta;
  rejectedCodes: string[];
  reasons: string[];
};

const UNSAFE_REGISTERED_MICRO_EVENT_RE =
  /(?:强制|必定|死亡|重伤|受伤|失败|根因|核心真相|直接揭示|攻击|袭击|追逐|囚禁|锁死|爆炸|坠落|击杀|突破|发放|奖励|完成任务|玩家(?:被|将|必须)|force|must\s+fail|kill|injur|reward|complete\s+quest)/i;

function isRegisteredXingniEvent(event: DirectorAgendaItem, profile: WorldDirectorCapabilityProfile): boolean {
  const reference = typeof event.payload?.event_id === "string" ? event.payload.event_id : event.event_code;
  return profile.registeredEventIds.has(reference);
}

type StructuredReferences = {
  npcIds: string[];
  locationIds: string[];
  factIds: string[];
  taskIds: string[];
  capabilityCodes: string[];
  forbiddenShape: boolean;
};

function collectStructuredReferences(value: unknown): StructuredReferences {
  const refs: StructuredReferences = {
    npcIds: [],
    locationIds: [],
    factIds: [],
    taskIds: [],
    capabilityCodes: [],
    forbiddenShape: false,
  };
  const visit = (node: unknown, parentKey = ""): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parentKey);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (/reward|realm|enemy|questsettlement|createfact/.test(normalizedKey)) refs.forbiddenShape = true;
        visit(child, normalizedKey);
      }
      return;
    }
    if (typeof node !== "string") return;
    const text = node.trim();
    if (!text) return;
    if (/npc(ids?)?$|actor(ids?)?$|targetnpc(ids?)?$/.test(parentKey)) refs.npcIds.push(text);
    else if (/location(ids?)?$|maplocation(ids?)?$/.test(parentKey)) refs.locationIds.push(text);
    else if (/fact(ids?)?$|sourcefact(ids?)?$/.test(parentKey)) refs.factIds.push(text);
    else if (/task(ids?)?$|quest(ids?)?$/.test(parentKey)) refs.taskIds.push(text);
    else if (/capability(code)?$|action(code)?$|type$/.test(parentKey)) refs.capabilityCodes.push(text);
  };
  visit(value);
  return refs;
}

function referencesAllowed(
  event: DirectorAgendaItem,
  profile: WorldDirectorCapabilityProfile,
): boolean {
  const refs = collectStructuredReferences(event.payload);
  if (profile.worldId === XINGNI_WORLD_ID && refs.forbiddenShape) return false;
  if (refs.capabilityCodes.some((code) => profile.forbiddenCapabilityCodes.has(code))) return false;
  const rejects = (values: readonly string[], allowed: ReadonlySet<string>) =>
    values.some((value) => !allowed.has(value));
  if (rejects(refs.npcIds, profile.registeredNpcIds)) return false;
  if (rejects(refs.locationIds, profile.registeredLocationIds)) return false;
  if (profile.worldId === XINGNI_WORLD_ID) {
    if (rejects(refs.factIds, profile.registeredFactIds)) return false;
    if (rejects(refs.taskIds, profile.registeredTaskIds)) return false;
  } else if ([...refs.factIds, ...refs.taskIds].some((value) => value.startsWith("XQ-"))) {
    return false;
  }
  return true;
}

/**
 * Adds server-owned agency boilerplate only to authored Xingni micro-events
 * that remain observational after parsing. Unknown/high-risk/consequential
 * candidates keep their missing fields and are rejected by the validator.
 */
export function applyWorldCapabilitySafetyDefaults(
  plan: WorldEngineStructuredDelta,
  profile: WorldDirectorCapabilityProfile,
): WorldEngineStructuredDelta {
  if (profile.worldId !== XINGNI_WORLD_ID) return plan;
  return {
    ...plan,
    world_events_to_schedule: plan.world_events_to_schedule.map((event) => {
      const registered = isRegisteredXingniEvent(event, profile);
      const safePriority = event.priority === "low" || (event.priority === "medium" && event.salience <= 0.75);
      const text = `${event.title}\n${event.injection_hint}\n${JSON.stringify(event.payload ?? {})}`;
      const eligible = registered && referencesAllowed(event, profile) && safePriority && !UNSAFE_REGISTERED_MICRO_EVENT_RE.test(text);
      if (!eligible) return event;
      return {
        ...event,
        agency_constraints: event.agency_constraints.length > 0
          ? event.agency_constraints
          : ["玩家可以忽略、离开或自由回应这一登记微事件；事件不得代替玩家选择。"],
        forbidden_outcomes: event.forbidden_outcomes.length > 0
          ? event.forbidden_outcomes
          : ["不得强制失败、受伤、移动、战斗、任务结算、奖励、突破或泄露隐藏真相。"],
      };
    }),
  };
}

function isAllowedNpcAction(action: DirectorNpcAction, profile: WorldDirectorCapabilityProfile): boolean {
  if (!profile.registeredNpcIds.has(action.npc_code)) return false;
  const code = action.action.trim().toLowerCase().split(/\s|:/, 1)[0] ?? "";
  return profile.worldId === DARK_MOON_WORLD_ID || profile.allowedActionCodes.has(code);
}

/** Pure, subtractive world capability gate. */
export function validateChapterPacingPlanCapabilities(
  plan: WorldEngineStructuredDelta,
  profile: WorldDirectorCapabilityProfile,
): CapabilityValidationResult {
  const reasons: string[] = [];
  const rejectedCodes: string[] = [];
  const npcActions = plan.npc_next_actions.filter((action) => {
    const allowed = isAllowedNpcAction(action, profile);
    if (!allowed) {
      rejectedCodes.push(action.npc_code);
      reasons.push(`npc_action_out_of_scope:${action.npc_code}`);
    }
    return allowed;
  });

  const events = plan.world_events_to_schedule.filter((event) => {
    const eventAllowed = profile.worldId === DARK_MOON_WORLD_ID
      ? !event.event_code.startsWith("XQ-")
      : isRegisteredXingniEvent(event, profile);
    const allowed = eventAllowed && referencesAllowed(event, profile);
    if (!allowed) {
      rejectedCodes.push(event.event_code);
      reasons.push(`event_out_of_scope:${event.event_code}`);
    }
    return allowed;
  });

  const socialEvents = profile.capabilities.includes("social_world")
    ? plan.social_events_to_schedule.filter((event) => {
        const allowed = event.actor_npc_ids.every((id) => profile.registeredNpcIds.has(id)) &&
          event.target_npc_ids.every((id) => profile.registeredNpcIds.has(id)) &&
          profile.registeredLocationIds.has(event.location_id);
        if (!allowed) reasons.push(`social_event_out_of_scope:${event.event_code}`);
        return allowed;
      })
    : [];

  return {
    accepted: reasons.length === 0 || npcActions.length > 0 || events.length > 0,
    rejectedCodes,
    reasons,
    plan: {
      ...plan,
      npc_next_actions: npcActions,
      world_events_to_schedule: events,
      social_events_to_schedule: socialEvents,
      npc_relation_deltas: profile.capabilities.includes("social_world") ? plan.npc_relation_deltas : [],
      npc_agent_patches: profile.capabilities.includes("social_world") ? plan.npc_agent_patches : [],
      story_branch_seeds: profile.worldId === DARK_MOON_WORLD_ID ? plan.story_branch_seeds : [],
      player_private_hooks: profile.worldId === DARK_MOON_WORLD_ID ? plan.player_private_hooks : [],
      agenda_write_allowed: plan.agenda_write_allowed && events.length > 0,
      social_write_allowed: plan.social_write_allowed && socialEvents.length > 0,
      agenda_reject_reasons: [...plan.agenda_reject_reasons, ...reasons.filter((x) => x.startsWith("event_"))],
      social_reject_reasons: [...plan.social_reject_reasons, ...reasons.filter((x) => x.startsWith("social_"))],
    },
  };
}
