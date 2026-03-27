import type { ContentPack, NpcContentSpec, TaskContentSpec, EscapeContentSpec } from "./types";

export const EXAMPLE_NPC_SPEC: NpcContentSpec = {
  id: "N-999",
  layer: "dramatic_overlay",
  meta: { version: "1.0.0", source: "authoring_template", lastReviewedAt: "2026-03-27" } as any,
  identity: {
    displayName: "示例NPC",
    homeNode: "B1_SafeZone",
    floor: "B1",
    specialty: "示例职能",
  },
  surface: {
    appearance: "外观一句话（短、可复用）。",
    publicPersonality: "公开性格（给玩家看的面具）。",
  },
  interaction: {
    speechPattern: "说话模式（短句/节奏/口头禅风格）。",
    tabooBoundary: "禁忌边界（玩家不能踩的线）。",
    relationshipHooks: ["互惠", "试探"],
    questHooks: ["task:example"],
    surfaceSecrets: ["表层秘密（可轻揭露）。"],
  },
  secret: {
    trueMotives: ["深层动机（只给系统/心脏层/导演层引用）。"],
    conspiracyRole: "阴谋角色位（可空）",
    revealConditions: ["trust>=50"],
  },
  heart: {
    coreFear: "核心恐惧",
    ruptureThreshold: { trustBelow: 10, fearAbove: 70, debtAbove: 30 },
    taskStyle: "transactional",
    truthfulnessBand: "medium",
    emotionalDebtPattern: "情感债模式一句话。",
  },
  roles: {
    escapeRole: "ally",
    guidanceRoles: ["b1_guidance"],
    contentTags: ["demo"],
  },
  voiceContract: {
    oneLine: "一句话声线契约（供 prompt compiler 取用）。",
    forbiddenPhrases: ["系统提示", "触发码"],
    antiRepetitionHints: ["别每句都用同一个句式。"],
  },
  revealPolicy: {
    maxRevealTier: 2,
    neverSay: ["变量名", "budget", "cooldown"],
  },
};

export const EXAMPLE_TASK_SPEC: TaskContentSpec = {
  id: "task.example.template",
  layer: "dramatic_overlay",
  meta: { version: "1.0.0", source: "authoring_template", lastReviewedAt: "2026-03-27" } as any,
  core: {
    title: "示例任务",
    desc: "用一句话说明目标与可验证结果。",
    type: "side",
    floorTier: "B1",
  },
  issuer: {
    issuerId: "N-999",
    issuerName: "示例NPC",
    claimMode: "npc_grant",
    npcProactiveGrant: {
      enabled: true,
      npcId: "N-999",
      minFavorability: 0,
      preferredLocations: ["B1_SafeZone"],
      cooldownHours: 6,
    },
  },
  dramatic: {
    dramaticType: "investigation",
    issuerIntent: "NPC 为什么要发这个任务。",
    playerHook: "玩家为什么会接。",
    urgencyReason: "为什么现在必须做。",
    riskNote: "风险提示（不系统腔）。",
    taboo: "禁区一句话。",
    residueOnComplete: "完成后的长期残响。",
    residueOnFail: "失败后的长期残响。",
    relatedEscapeProgress: "cond:escape.condition.example",
    followupSeedCodes: ["event.example.seed"],
    spokenDeliveryStyle: "交付语气（短）。",
  },
  hooks: {
    worldConsequences: ["flag:example"],
    reward: { originium: 1, items: ["I-C12"] },
    hiddenTriggerConditions: [],
  },
};

export const EXAMPLE_ESCAPE_SPEC: EscapeContentSpec = {
  meta: { version: "1.0.0", source: "authoring_template", lastReviewedAt: "2026-03-27" } as any,
  conditions: [
    { code: "escape.condition.example", label: "示例条件", required: true, kind: "escape_condition" },
  ],
  fragments: [
    { code: "escape.fragment.example", label: "示例碎片", hint: "一句话碎片提示", anchors: { npcIds: ["N-999"] } },
  ],
  falseLeads: [
    { code: "escape.falselead.example", label: "示例假出口", warning: "一句话风险警告", anchors: { locationIds: ["1F_Lobby"] } },
  ],
  outcomes: [
    { code: "true_escape", title: "真正逃离", toneLine: "示例定调" },
    { code: "false_escape", title: "假逃离", toneLine: "示例定调" },
    { code: "costly_escape", title: "代价逃离", toneLine: "示例定调" },
    { code: "doom", title: "终焉", toneLine: "示例定调" },
  ],
};

export const EXAMPLE_PACK: ContentPack = {
  manifest: {
    packId: "examplePack",
    version: "1.0.0",
    enabledScopes: ["base"],
    meta: { version: "1.0.0", source: "authoring_template", lastReviewedAt: "2026-03-27" } as any,
  },
  npcSpecs: [EXAMPLE_NPC_SPEC],
  taskSpecs: [EXAMPLE_TASK_SPEC],
  escapeSpecs: EXAMPLE_ESCAPE_SPEC,
};

