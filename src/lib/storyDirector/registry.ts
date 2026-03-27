import type { IncidentEnvelope, IncidentKind, StoryDirectorState } from "./types";
import type { DirectorSignals } from "./signals";

export type IncidentTemplate = {
  incidentCode: string;
  title: string;
  kind: IncidentKind;
  minCooldownTurns: number;
  oneShot: boolean;
  severity: "low" | "medium" | "high";
  recommendedBeatModes: Array<"pressure" | "collision" | "countdown" | "reveal" | "peak">;
  anchorPolicy: "location" | "npc" | "task" | "any";
  shouldTrigger: (args: { director: StoryDirectorState; signals: DirectorSignals }) => boolean;
  build: (args: { nowTurn: number; director: StoryDirectorState; signals: DirectorSignals }) => Omit<
    IncidentEnvelope,
    "id" | "status"
  >;
};

function mkId(nowTurn: number, code: string): string {
  return `inc_${nowTurn}_${code}_${Math.random().toString(36).slice(2, 7)}`;
}

function asDue(nowTurn: number, inTurns: number): { dueTurn: number; expiresTurn: number } {
  const due = Math.max(0, nowTurn + Math.max(0, Math.trunc(inTurns)));
  return { dueTurn: due, expiresTurn: due + 3 };
}

export const INCIDENT_REGISTRY: Record<string, IncidentTemplate> = {
  npc_demand_repayment: {
    incidentCode: "npc_demand_repayment",
    title: "有人来催你还账",
    kind: "repayment_due",
    minCooldownTurns: 4,
    oneShot: false,
    severity: "medium",
    recommendedBeatModes: ["pressure", "collision", "peak"],
    anchorPolicy: "npc",
    shouldTrigger: ({ signals }) => signals.debtPileup || signals.promisePileup,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "npc_demand_repayment"),
        incidentCode: "npc_demand_repayment",
        title: "有人来催你还账",
        kind: "repayment_due",
        severity: "medium",
        source: "director",
        scope: "npc_local",
        anchors: {},
        ...due,
        cooldownTurns: 4,
        oneShot: false,
        status: "queued",
        payload: { demand: "repay_or_explain" },
      } as any;
    },
  },

  route_suddenly_blocked: {
    incidentCode: "route_suddenly_blocked",
    title: "原路线突然失效",
    kind: "route_block",
    minCooldownTurns: 5,
    oneShot: false,
    severity: "medium",
    recommendedBeatModes: ["pressure", "countdown", "peak"],
    anchorPolicy: "location",
    shouldTrigger: ({ signals }) => signals.stalled,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "route_suddenly_blocked"),
        incidentCode: "route_suddenly_blocked",
        title: "原路线突然失效",
        kind: "route_block",
        severity: "medium",
        source: "director",
        scope: "location_local",
        anchors: {},
        ...due,
        cooldownTurns: 5,
        oneShot: false,
        status: "queued",
        payload: { block: "soft" },
      } as any;
    },
  },

  false_safe_zone_break: {
    incidentCode: "false_safe_zone_break",
    title: "安全感被打破",
    kind: "false_safe_break",
    minCooldownTurns: 6,
    oneShot: false,
    severity: "high",
    recommendedBeatModes: ["pressure", "peak"],
    anchorPolicy: "location",
    shouldTrigger: ({ signals }) => signals.falseCalmRisk,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "false_safe_zone_break"),
        incidentCode: "false_safe_zone_break",
        title: "安全感被打破",
        kind: "false_safe_break",
        severity: "high",
        source: "director",
        scope: "location_local",
        anchors: {},
        ...due,
        cooldownTurns: 6,
        oneShot: false,
        status: "queued",
        payload: { break: "ambient_to_real" },
      } as any;
    },
  },

  npc_collision_now: {
    incidentCode: "npc_collision_now",
    title: "两个人在同一处碰上了",
    kind: "npc_collision",
    minCooldownTurns: 6,
    oneShot: false,
    severity: "high",
    recommendedBeatModes: ["collision", "peak"],
    anchorPolicy: "npc",
    shouldTrigger: ({ signals }) => signals.nearPeak,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "npc_collision_now"),
        incidentCode: "npc_collision_now",
        title: "两个人在同一处碰上了",
        kind: "npc_collision",
        severity: "high",
        source: "director",
        scope: "location_local",
        anchors: {},
        ...due,
        cooldownTurns: 6,
        oneShot: false,
        status: "queued",
        payload: { force_side: true },
      } as any;
    },
  },

  countdown_window: {
    incidentCode: "countdown_window",
    title: "机会窗口正在缩短",
    kind: "deadline",
    minCooldownTurns: 4,
    oneShot: false,
    severity: "medium",
    recommendedBeatModes: ["countdown", "pressure"],
    anchorPolicy: "any",
    shouldTrigger: ({ signals }) => signals.highPressure && signals.stalled,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "countdown_window"),
        incidentCode: "countdown_window",
        title: "机会窗口正在缩短",
        kind: "deadline",
        severity: "medium",
        source: "director",
        scope: "run_private",
        anchors: {},
        ...due,
        cooldownTurns: 4,
        oneShot: false,
        status: "queued",
        payload: { windowTurns: 2 },
      } as any;
    },
  },

  evidence_about_to_be_lost: {
    incidentCode: "evidence_about_to_be_lost",
    title: "证据快要消失了",
    kind: "deadline",
    minCooldownTurns: 5,
    oneShot: false,
    severity: "medium",
    recommendedBeatModes: ["pressure", "countdown", "reveal"],
    anchorPolicy: "task",
    shouldTrigger: ({ signals }) => signals.hooksReady && signals.stalled,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 1);
      return {
        id: mkId(nowTurn, "evidence_about_to_be_lost"),
        incidentCode: "evidence_about_to_be_lost",
        title: "证据快要消失了",
        kind: "deadline",
        severity: "medium",
        source: "director",
        scope: "location_local",
        anchors: {},
        ...due,
        cooldownTurns: 5,
        oneShot: false,
        status: "queued",
        payload: { hint: "trace_now" },
      } as any;
    },
  },

  resource_shock: {
    incidentCode: "resource_shock",
    title: "关键资源突然失效",
    kind: "resource_shock",
    minCooldownTurns: 6,
    oneShot: false,
    severity: "medium",
    recommendedBeatModes: ["pressure", "peak"],
    anchorPolicy: "any",
    shouldTrigger: ({ signals }) => signals.stalled && !signals.threatHot,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "resource_shock"),
        incidentCode: "resource_shock",
        title: "关键资源突然失效",
        kind: "resource_shock",
        severity: "medium",
        source: "director",
        scope: "run_private",
        anchors: {},
        ...due,
        cooldownTurns: 6,
        oneShot: false,
        status: "queued",
        payload: { what: "permission_or_item" },
      } as any;
    },
  },

  silent_following_reveal: {
    incidentCode: "silent_following_reveal",
    title: "一直跟着你的东西露出痕迹",
    kind: "reveal",
    minCooldownTurns: 5,
    oneShot: false,
    severity: "low",
    recommendedBeatModes: ["reveal", "pressure"],
    anchorPolicy: "any",
    shouldTrigger: ({ signals }) => signals.hooksReady,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "silent_following_reveal"),
        incidentCode: "silent_following_reveal",
        title: "一直跟着你的东西露出痕迹",
        kind: "reveal",
        severity: "low",
        source: "director",
        scope: "run_private",
        anchors: {},
        ...due,
        cooldownTurns: 5,
        oneShot: false,
        status: "queued",
        payload: { reveal: "shadow" },
      } as any;
    },
  },

  threat_push_close: {
    incidentCode: "threat_push_close",
    title: "主威胁逼近",
    kind: "pursuit",
    minCooldownTurns: 4,
    oneShot: false,
    severity: "high",
    recommendedBeatModes: ["pressure", "peak", "countdown"],
    anchorPolicy: "location",
    shouldTrigger: ({ signals }) => signals.threatHot || signals.nearPeak,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 0);
      return {
        id: mkId(nowTurn, "threat_push_close"),
        incidentCode: "threat_push_close",
        title: "主威胁逼近",
        kind: "pursuit",
        severity: "high",
        source: "director",
        scope: "location_local",
        anchors: {},
        ...due,
        cooldownTurns: 4,
        oneShot: false,
        status: "queued",
        payload: { push: "near" },
      } as any;
    },
  },

  exit_condition_reprice: {
    incidentCode: "exit_condition_reprice",
    title: "离开的代价上浮",
    kind: "pressure",
    minCooldownTurns: 8,
    oneShot: false,
    severity: "high",
    recommendedBeatModes: ["pressure", "peak"],
    anchorPolicy: "any",
    shouldTrigger: ({ signals }) => signals.promisePileup && signals.debtPileup,
    build: ({ nowTurn }) => {
      const due = asDue(nowTurn, 1);
      return {
        id: mkId(nowTurn, "exit_condition_reprice"),
        incidentCode: "exit_condition_reprice",
        title: "离开的代价上浮",
        kind: "pressure",
        severity: "high",
        source: "director",
        scope: "session_world",
        anchors: {},
        ...due,
        cooldownTurns: 8,
        oneShot: false,
        status: "queued",
        payload: { reprice: "higher" },
      } as any;
    },
  },
};

export function buildIncidentFromTemplate(args: {
  templateCode: string;
  nowTurn: number;
  director: StoryDirectorState;
  signals: DirectorSignals;
}): IncidentEnvelope | null {
  const tpl = INCIDENT_REGISTRY[args.templateCode];
  if (!tpl) return null;
  const base = tpl.build({ nowTurn: args.nowTurn, director: args.director, signals: args.signals }) as any;
  const id = typeof base.id === "string" && base.id ? base.id : mkId(args.nowTurn, tpl.incidentCode);
  return {
    ...base,
    id,
    status: "queued",
  } as IncidentEnvelope;
}

