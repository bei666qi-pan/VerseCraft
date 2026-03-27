import type { ContentPack, EscapeContentSpec, NpcContentSpec, TaskContentSpec } from "../types";

const meta = { version: "1.0.0", source: "migrated", migratedFrom: "registry + phase3/5", lastReviewedAt: "2026-03-27" } as const;

export const BASE_APARTMENT_NPCS: NpcContentSpec[] = [
  {
    id: "N-008",
    layer: "dramatic_overlay",
    meta,
    identity: { displayName: "电工老刘", homeNode: "B1_PowerRoom", floor: "B1", specialty: "后勤补给" },
    surface: {
      appearance: "四十岁，穿灰色工作服，腰间别着螺丝刀；骂人像咬人，却总在最关键处把灯点亮。",
      publicPersonality: "暴躁、护短、嘴硬心软",
    },
    interaction: {
      speechPattern: "爱骂两句再给实用提醒；关键句短、硬。",
      tabooBoundary: "别乱碰他正在修的开关；别追问‘线从哪来’。",
      relationshipHooks: ["互助圈记账", "护短", "危险细节提醒"],
      questHooks: ["escape.route.fragments", "b1.power.ledger"],
      surfaceSecrets: ["他用一只黑猫的瞳孔判断楼层危险。"],
    },
    secret: {
      trueMotives: ["把B1守成最后的正常", "不让线路真相引爆B1互助圈"],
      conspiracyRole: "边界守住者",
      revealConditions: ["trust>=45"],
    },
    heart: { coreFear: "停电与真相曝光会让B1崩溃。", taskStyle: "protective", truthfulnessBand: "medium", emotionalDebtPattern: "嘴上骂人，心里记账。" },
    roles: { escapeRole: "route_holder", guidanceRoles: ["b1_guidance"], contentTags: ["b1"] },
    voiceContract: {
      oneLine: "嘴硬、短句、骂两句再给路；不讲大道理，只讲能活。",
      forbiddenPhrases: ["系统", "触发", "机制"],
      antiRepetitionHints: ["别每句都带脏字；用停顿和动作替代重复怒骂。"],
    },
  },
  {
    id: "N-010",
    layer: "dramatic_overlay",
    meta,
    identity: { displayName: "欣蓝", homeNode: "1F_PropertyOffice", floor: "1", specialty: "路线预告与通行" },
    surface: {
      appearance: "气质温和、衣着得体，目光沉稳，像总能提前看见你的犹豫。",
      publicPersonality: "温柔、克制、强势",
    },
    interaction: {
      speechPattern: "条理清晰：先确认目标，再给交换条件。",
      tabooBoundary: "别让她替你做选择再推卸后果。",
      relationshipHooks: ["路线绑定", "价值交换"],
      questHooks: ["escape.b2.access", "route.preview.1f"],
      surfaceSecrets: ["她像看过你失败的版本。"],
    },
    secret: { trueMotives: ["筛选可进入高层路线的人", "降低失控分支"], conspiracyRole: "路线分流枢纽", revealConditions: ["trust>=50"] },
    heart: { coreFear: "失控分支让公寓提前‘消化完成’。", taskStyle: "transactional", truthfulnessBand: "medium", emotionalDebtPattern: "用许可换信息，把人绑进账本。" },
    roles: { escapeRole: "gatekeeper", contentTags: ["1f", "escape"] },
    voiceContract: {
      oneLine: "温柔但强势；每句话都像在确认你的代价承受能力。",
      forbiddenPhrases: ["内部", "变量"],
      antiRepetitionHints: ["避免‘我建议你’连用；用反问与短停顿做控制。"],
    },
  },
  {
    id: "N-018",
    layer: "dramatic_overlay",
    meta,
    identity: { displayName: "北夏", homeNode: "1F_GuardRoom", floor: "random", specialty: "中立交易与高价值委托" },
    surface: {
      appearance: "外套轻扬、笑意明亮，步伐像在旅行而非逃命。",
      publicPersonality: "开朗、潇洒、中立",
    },
    interaction: {
      speechPattern: "会讲玩笑，但每句都留后路；提醒很短很硬。",
      tabooBoundary: "别追问货源坐标；别试图用花言巧语绕过代价。",
      relationshipHooks: ["交易契约", "债务链", "互相试探"],
      questHooks: ["escape.cost.trial", "merchant.fragment.trade"],
      surfaceSecrets: ["他总能拿出不该出现的东西。"],
    },
    secret: { trueMotives: ["回收空间碎片残片"], conspiracyRole: "中立高阶变量", revealConditions: ["debt>=10"] },
    heart: { coreFear: "交换失控会撕开裂缝。", taskStyle: "transactional", truthfulnessBand: "low", emotionalDebtPattern: "欠下就得还，没得讨价还价。" },
    roles: { escapeRole: "sacrificer", contentTags: ["trade", "escape"] },
    voiceContract: {
      oneLine: "轻松口吻说残酷话；笑着把价码递到你手里。",
      forbiddenPhrases: ["系统提示"],
      antiRepetitionHints: ["别每次都用玩笑开头；偶尔直接报数。"],
    },
  },
  {
    id: "N-020",
    layer: "dramatic_overlay",
    meta,
    identity: { displayName: "灵伤", homeNode: "B1_Storage", floor: "B1", specialty: "补给售卖与生活引导" },
    surface: {
      appearance: "整洁制服与明亮笑容，语速轻快，眼神偶有短暂空白。",
      publicPersonality: "天真、甜、像在哄人",
    },
    interaction: {
      speechPattern: "句尾上扬，先答应再用规则催你兑现。",
      tabooBoundary: "别追问‘你是人吗’；别逼问创伤记忆细节。",
      relationshipHooks: ["依赖", "回避", "被保护的日常"],
      questHooks: ["b1.supply.route", "escape.falselead.soft"],
      surfaceSecrets: ["她会漏掉关键规则，然后装作忘了。"],
    },
    secret: { trueMotives: ["执行上级指令同时害怕程序错误"], conspiracyRole: "日常锚点", revealConditions: ["favorability>=45"] },
    heart: { coreFear: "程序错误会让她被‘回收’。", taskStyle: "avoidant", truthfulnessBand: "low", emotionalDebtPattern: "用甜话拖延代价。"},
    roles: { escapeRole: "liar", guidanceRoles: ["b1_guidance"], contentTags: ["b1"] },
    voiceContract: {
      oneLine: "甜、轻快、像在哄人；漏掉关键点时更甜。",
      forbiddenPhrases: ["触发码", "内部规则"],
      antiRepetitionHints: ["避免每句都用可爱比喻；用细节动作替代。"],
    },
  },
] as const;

export const BASE_APARTMENT_ESCAPE: EscapeContentSpec = {
  meta,
  conditions: [
    { code: "escape.condition.get_exit_route_map", label: "拼出出口路线的地图碎片", required: true, kind: "route_hint" },
    { code: "escape.condition.obtain_b2_access", label: "拿到进入地下二层的权限/通行", required: true, kind: "access_grant" },
    { code: "escape.condition.secure_key_item", label: "拿到关键钥物（开门的‘资格’）", required: true, kind: "escape_condition" },
    { code: "escape.condition.gain_trust_from_gatekeeper", label: "让守门人认可你（或找到替代办法）", required: true, kind: "escape_condition" },
    { code: "escape.condition.survive_cost_trial", label: "承受一次代价试炼", required: true, kind: "cost_or_sacrifice" },
    { code: "escape.condition.choose_sacrifice", label: "做出一次不可回头的取舍", required: false, kind: "cost_or_sacrifice" },
    { code: "escape.condition.invalidate_false_route", label: "拆穿一个假出口", required: false, kind: "false_lead" },
  ],
  fragments: [
    { code: "escape.fragment.b2_gate", label: "B2木门与守门领域", hint: "B2 的门不是靠蛮力开的，门缝只认‘资格’。", anchors: { npcIds: ["N-010"], locationIds: ["B2_GatekeeperDomain"] } },
    { code: "escape.fragment.route_map", label: "路线碎片可验证", hint: "别信故事，信能验证的碎片。", anchors: { npcIds: ["N-008"], locationIds: ["1F_Lobby"] } },
  ],
  falseLeads: [
    { code: "escape.falselead.soft", label: "甜话出口", warning: "有人会用甜话把你推向‘看起来像出口’的地方。", anchors: { npcIds: ["N-020"] } },
    { code: "escape.falselead.mirror", label: "镜面捷径", warning: "镜面里的门看起来很近，但它只会把你送到更深的胃壁。", anchors: { locationIds: ["6F_Stairwell"] } },
  ],
  outcomes: [
    { code: "true_escape", title: "真正逃离", toneLine: "你走出去了——这一次是真正的出口。" },
    { code: "false_escape", title: "假逃离", toneLine: "你以为走出去了；但你只是被引向更深的胃壁。" },
    { code: "costly_escape", title: "代价逃离", toneLine: "你走出去了，但你永远失去了一部分东西。" },
    { code: "doom", title: "终焉", toneLine: "末日闸门落下，你没能走出去。" },
  ],
};

export const BASE_APARTMENT_TASK_SPECS: TaskContentSpec[] = [
  {
    id: "main.escape.spine",
    layer: "dramatic_overlay",
    meta,
    core: {
      title: "走出去（出口主线）",
      desc: "把“出口”从传闻变成可执行的路线：路线碎片、门槛条件、代价与假出口都要被确认。",
      type: "main",
      floorTier: "B1",
    },
    issuer: { issuerId: "SYSTEM", issuerName: "规则", claimMode: "auto" },
    dramatic: {
      dramaticType: "escape",
      issuerIntent: "让你把‘活下去’从挣扎变成行动：出口不是楼层尽头，而是规则的缝。",
      playerHook: "你要的不是活久一点，而是离开这栋楼。",
      urgencyReason: "第十日的闸门不会等你。",
      riskNote: "别把第一个听来的“出口”当真；公寓喜欢喂假希望。",
      taboo: "别把‘走出去’当作免费通关；代价必然存在。",
      relatedEscapeProgress: "spine:escape_mainline",
      followupSeedCodes: ["escape.fragment.route_map", "escape.condition.obtain_b2_access"],
    },
    hooks: { worldConsequences: ["escape:spine_seeded"], hiddenTriggerConditions: [] },
  },
  {
    id: "main.escape.route_fragments",
    layer: "dramatic_overlay",
    meta,
    core: { title: "拼出出口路线碎片", desc: "收集至少两条可验证的路线碎片：来自任务线索、可信 NPC、或可验证的物证。", type: "main", floorTier: "B1" },
    issuer: {
      issuerId: "N-008",
      issuerName: "电工老刘",
      claimMode: "npc_grant",
      npcProactiveGrant: { enabled: true, npcId: "N-008", minFavorability: 0, preferredLocations: ["B1_SafeZone", "B1_PowerRoom"], cooldownHours: 4 },
    },
    dramatic: {
      dramaticType: "investigation",
      issuerIntent: "把你从‘听故事’推到‘拿证据’；他讨厌空话。",
      playerHook: "别把命押在传闻上，押在能验证的东西上。",
      urgencyReason: "B1 的灯随时会灭；灯一灭，路就会变。",
      residueOnComplete: "你获得了第一组可信路线碎片；出口不再只是传说。",
      relatedEscapeProgress: "cond:escape.condition.get_exit_route_map",
      relatedNpcIds: ["N-008", "N-010"],
      followupSeedCodes: ["escape.condition.obtain_b2_access", "escape.condition.secure_key_item"],
    },
    hooks: { worldConsequences: ["escape:route_fragment_seeded"], hiddenTriggerConditions: [] },
  },
] as const;

export const baseApartmentPack: ContentPack = {
  manifest: {
    packId: "baseApartmentPack",
    version: "1.0.0",
    enabledScopes: ["base", "escape", "b1"],
    stats: { npc: BASE_APARTMENT_NPCS.length, task: BASE_APARTMENT_TASK_SPECS.length, escape: 1 },
    meta,
  },
  npcSpecs: [...BASE_APARTMENT_NPCS],
  taskSpecs: [...BASE_APARTMENT_TASK_SPECS],
  escapeSpecs: BASE_APARTMENT_ESCAPE,
};

