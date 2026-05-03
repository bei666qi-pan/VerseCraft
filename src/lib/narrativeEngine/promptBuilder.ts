import {
  assemblePlayerChatPrompt,
} from "@/lib/turnEngine/promptAssembly";
import { MODEL_OUTPUT_STRICT_JSON_SCHEMA } from "./schema";
import type { DialogueContext } from "./types";

export { assemblePlayerChatPrompt };

export type AssembleNarrativePromptArgs = Parameters<typeof assemblePlayerChatPrompt>[0];
export type AssembleNarrativePromptResult = ReturnType<typeof assemblePlayerChatPrompt>;

export function buildNarrativePrompt(args: AssembleNarrativePromptArgs): AssembleNarrativePromptResult {
  return assemblePlayerChatPrompt(args);
}

export type NarrativePromptPacket = {
  system: string;
  developer?: string;
  user: string;
  debugPacket: Record<string, unknown>;
};

const SECTION_ORDER = [
  "稳定系统规则",
  "世界规则包",
  "当前章节包",
  "当前场景包",
  "NPC 身份包",
  "NPC 已知信息边界",
  "NPC 记忆包",
  "玩家状态包",
  "最近事件包",
  "禁止透露信息包",
  "输出 Schema 包",
  "风格约束包",
] as const;

export function buildNarrativePromptPacket(context: DialogueContext): NarrativePromptPacket {
  const packets = buildPackets(context);
  const system = SECTION_ORDER.map((title) => renderSection(title, packets[title])).join("\n\n");
  const developer = [
    "你正在为 VerseCraft 生成候选叙事回合。候选结果会被本地 schema、NPC/reveal checker 与 committer 裁决。",
    "如果当前 provider 支持 OpenAI Structured Outputs / strict JSON Schema，调用方应使用 debugPacket.outputFormat.strictJsonSchema。",
    "如果当前 provider 只支持 JSON object，请仍严格输出单个 JSON object；本地会执行 ModelOutputZodSchema 与 checkModelOutput。",
  ].join("\n");
  const user = [
    "请基于上方 packet 和调用方随后追加的真实玩家输入，生成一个 ModelOutputSchema 候选对象。",
    "如果没有收到真实玩家输入，不要补写玩家动作；只返回保守的 narrative_only 候选。",
    "不要把 JSON、字段名、校验说明或技术解释写进 narrative 字段。",
  ].join("\n");

  return {
    system,
    developer,
    user,
    debugPacket: {
      requestId: context.requestId,
      sessionId: context.sessionId,
      userId: context.userId,
      sectionOrder: SECTION_ORDER,
      packets,
      outputFormat: {
        preferred: "openai_structured_outputs_json_schema_strict",
        currentGatewayFallback: "response_format_json_object",
        localValidation: "ModelOutputZodSchema + checkModelOutput",
        strictJsonSchema: MODEL_OUTPUT_STRICT_JSON_SCHEMA,
      },
      packetStats: {
        loreFactCount: countArray(packets["世界规则包"].loreFacts),
        hardRuleCount: countArray(packets["世界规则包"].hardRules),
        npcMemoryCount: countArray(packets["NPC 记忆包"].memories),
        recentEventCount: countArray(packets["最近事件包"].events),
        forbiddenFactCount: countArray(packets["禁止透露信息包"].forbiddenFactIds),
      },
    },
  };
}

function buildPackets(context: DialogueContext): Record<(typeof SECTION_ORDER)[number], Record<string, unknown>> {
  const forbidden = new Set(context.world.forbiddenFactIds);
  const loreFacts = context.world.loreFacts
    .filter((fact) => !forbidden.has(fact.factKey))
    .slice(0, 32)
    .map((fact) => ({
      factKey: fact.factKey,
      canonicalText: clip(fact.canonicalText, 360),
      layer: fact.layer ?? null,
      tags: fact.tags ?? [],
    }));
  const hardRules = context.world.hardRules
    .filter((rule) => !containsForbiddenToken(rule, forbidden))
    .slice(0, 16)
    .map((rule) => clip(rule, 360));
  const npc = context.activeNpc;
  const npcMemories = context.npcMemories
    .filter((memory) => !containsForbiddenToken(memory.summary, forbidden))
    .slice(0, 8)
    .map((memory) => ({
      id: memory.id,
      npcId: memory.npcId,
      scope: memory.scope,
      kind: memory.kind,
      summary: clip(memory.summary, 220),
      salience: memory.salience,
      confidence: memory.confidence,
      emotion: memory.emotion ?? {},
    }));
  const recentEvents = context.recentEvents.slice(0, 12).map((event) => ({
    id: event.id,
    turnIndex: event.turnIndex,
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    eventType: event.eventType,
    summary: clip(event.summary, 220),
  }));

  return {
    "稳定系统规则": {
      role: "VerseCraft narrative candidate generator",
      rules: [
        "只根据 packet 中明确给出的事实生成候选结果。",
        "模型输出只是候选；代码侧 checker 和 committer 才是最终裁决。",
        "禁止自创关键人物、地点、规则、任务、道具或未登记实体。",
        "不知道的信息保持模糊，不得补全。",
        "不要提前透露未解锁真相，也不要把 DM-only 信息写入 narrative、options 或事件。",
        "请严格以 JSON 格式输出，且只输出一个 JSON object。",
      ],
    },
    "世界规则包": {
      worldId: context.world.worldId,
      revealTier: context.world.revealTier,
      loreFacts,
      hardRules,
      allowedEntityIds: context.world.allowedEntityIds.slice(0, 160),
      ruleUsePolicy: [
        "只能引用 loreFacts.factKey 或 hardRules 中出现的世界规则。",
        "若规则没有进入本包，必须视为未知，不能现场发明。",
      ],
    },
    "当前章节包": {
      chapterId: context.chapter.chapterId,
      status: context.chapter.status,
      objective: context.chapter.objective,
      completedBeatIds: context.chapter.completedBeatIds,
      allowedEventIds: context.chapter.allowedEventIds,
      blockedEventIds: context.chapter.blockedEventIds,
      policy: "章节推进只能使用 allowedEventIds 和结构化 state/event 候选，不得解析 narrative 自行推进。",
    },
    "当前场景包": {
      sceneId: context.chapter.sceneId ?? context.player.locationId,
      playerLocationId: context.player.locationId,
      allowedEntityIds: context.world.allowedEntityIds.slice(0, 160),
      sceneLoreFactKeys: loreFacts.map((fact) => fact.factKey),
      policy: "场景内只能使用 allowedEntityIds 和 sceneLoreFactKeys；未列出的地点/角色/物品不可突然出现。",
    },
    "NPC 身份包": npc
      ? {
          npcId: npc.npcId,
          displayName: npc.displayName,
          publicRole: npc.publicRole ?? null,
          speechContract: npc.speechContract ?? null,
          coreDrive: npc.coreDrive ?? null,
          coreFear: npc.coreFear ?? null,
          tabooBoundary: npc.tabooBoundary ?? null,
          truthfulnessBand: npc.truthfulnessBand ?? null,
          attitudeLabel: npc.attitudeLabel ?? null,
          relation: npc.relation ?? {},
          motivationSources: buildNpcMotivationSources(context),
          policy: "NPC 说话风格、身份和动机只能来自本包、NPC 记忆包、当前任务/章节目标或最近事件。",
        }
      : {
          npcId: null,
          policy: "当前没有 activeNpc；不得输出明确 NPC 内心独白、NPC 回复事件或临场捏造 NPC。",
        },
    "NPC 已知信息边界": {
      activeNpcId: npc?.npcId ?? null,
      knownFactIds: npc?.knownFactIds ?? [],
      forbiddenFactIds: uniqueStrings([...(npc?.forbiddenFactIds ?? []), ...context.world.forbiddenFactIds]),
      boundaryRules: [
        "NPC 不能说出 forbiddenFactIds 对应事实。",
        "NPC 不能知道 recentEvents 之外的未发生事件。",
        "NPC 不知道的信息必须以犹豫、回避或表层观察表达，不能补全真相。",
      ],
    },
    "NPC 记忆包": {
      memories: npcMemories,
      policy: "记忆只能影响态度、措辞、关注点和关系，不得绕过 reveal 边界解锁真相。",
    },
    "玩家状态包": {
      locationId: context.player.locationId,
      time: context.player.time,
      stats: context.player.stats,
      inventoryIds: context.player.inventoryIds,
      currentProfession: context.player.currentProfession ?? null,
      knownFactIds: context.player.knownFactIds,
      discoveredClueIds: context.player.discoveredClueIds,
    },
    "最近事件包": {
      events: recentEvents,
      policy: "只能把 recentEvents 当作已发生事实；未在其中出现的事件不能被 NPC 当作已知。",
    },
    "禁止透露信息包": {
      forbiddenFactIds: context.world.forbiddenFactIds,
      redactionPolicy: [
        "本包只给出禁止事实 ID，不给出事实正文。",
        "不要在 narrative、decisionOptions、eventCandidates、revealAttempts、consistencyNotes 中输出这些 ID 或其内容。",
        "如果玩家追问未解锁真相，只给可感知线索、情绪反应或调查方向。",
      ],
    },
    "输出 Schema 包": {
      schemaName: MODEL_OUTPUT_STRICT_JSON_SCHEMA.name,
      strictJsonSchema: MODEL_OUTPUT_STRICT_JSON_SCHEMA.schema,
      fallbackPolicy: "provider 不支持 strict JSON Schema 时，仍输出 JSON object，由本地 zod schema 与三层 checker 校验。",
      allowedStateChangeFields: [
        "playerLocation",
        "sanityDelta",
        "hpDelta",
        "originiumDelta",
        "timeCost",
        "taskUpdates",
        "relationshipUpdates",
        "clueUpdates",
      ],
      allowedEventCandidateTypes: [
        "player_action",
        "npc_reply",
        "state_change",
        "fact_unlock",
        "clue_found",
        "task_started",
        "task_updated",
        "relationship_changed",
        "consistency_degrade",
      ],
      disallowedFields: [
        "snapshot",
        "runSnapshotV2",
        "clientState",
        "gameState",
        "saveSlots",
        "statePatch",
        "stateDelta",
      ],
    },
    "风格约束包": {
      narrativeStyle: [
        "保持中文互动小说气质，写玩家可感知的动作、环境、声音、迟疑和后果。",
        "narrative 字段面向玩家，但不要在其中输出 JSON、代码字段、校验说明或技术解释。",
        "结构化字段面向代码处理，最终展示仍由现有系统收口。",
        "不要把玩法改写成传统数值战斗，不要主动展开数值结算面板。",
        "选项必须是下一步自然语言行动，不是 UI 菜单、图鉴、设置、任务栏或系统按钮。",
      ],
    },
  };
}

function buildNpcMotivationSources(context: DialogueContext): Record<string, unknown> {
  const npc = context.activeNpc;
  if (!npc) return {};
  return {
    coreDrive: npc.coreDrive ?? null,
    chapterObjective: context.chapter.objective,
    relevantMemories: context.npcMemories
      .filter((memory) => memory.npcId === npc.npcId)
      .slice(0, 4)
      .map((memory) => ({
        kind: memory.kind,
        summary: clip(memory.summary, 160),
        salience: memory.salience,
      })),
    recentEvents: context.recentEvents
      .filter((event) => event.actorId === npc.npcId || event.actorType === "player")
      .slice(0, 4)
      .map((event) => ({
        eventType: event.eventType,
        summary: clip(event.summary, 160),
      })),
  };
}

function renderSection(title: string, packet: Record<string, unknown>): string {
  return `## ${title}\n${stableJson(packet)}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function clip(value: string, max: number): string {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function containsForbiddenToken(text: string, forbidden: Set<string>): boolean {
  if (!text) return false;
  for (const token of forbidden) {
    if (token.length >= 3 && text.includes(token)) return true;
  }
  return false;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
