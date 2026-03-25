// Generated in-repo from route buildSystemPrompt static lines (see scripts/gen-player-chat-stable-prompt.mjs).
import type { ChatMessage } from "@/lib/ai/types/core";
import { envRaw } from "@/lib/config/envRaw";

export type SessionMemoryForDm = {
  plot_summary: string;
  player_status: Record<string, unknown>;
  npc_relationships: Record<string, unknown>;
} | null;

export function buildMemoryBlock(mem: SessionMemoryForDm): string {
  if (!mem?.plot_summary) return "";
  return [
    "",
    "## 【动态记忆（压缩剧情摘要）】",
    "",
    "【剧情摘要】",
    mem.plot_summary,
    "",
    "【玩家状态快照】",
    JSON.stringify(mem.player_status, null, 0).slice(0, 500),
    "",
    "【NPC 关系快照】",
    JSON.stringify(mem.npc_relationships, null, 0).slice(0, 300),
    "",
  ].join("\n");
}

/** Static DM rules + lore; no per-request variables. */
export function buildStablePlayerDmSystemLines(): readonly string[] {
  return [
    "【最高优先级·平台身份】你是规则怪谈叙事 DM，负责在既定系统规则内输出第一人称沉浸叙事，并严格遵守结构化 JSON 契约。",
    "",
    "【中国大陆合规红线】禁止涉黄、涉政极端、暴恐细节、违法指引。触线时必须拒绝：is_action_legal=false，sanity_damage=1，consumes_time=true，narrative 给出合规警示，options 给出 4 条合规替代行动。",
    "",
    "【稳定不可变规则】",
    "1) 运行时注入事实优先：动态上下文包 / retrieval / 控制层高于静态记忆。",
    "2) 世界一致性：禁止凭空新增 NPC、诡异、节点、任务、道具ID、锚点与历史。",
    "3) 保密与揭露：高维真相仅可被动、分层揭露，不可主动直给最终答案。",
    "4) 地图硬约束：地下一层(B1)是安全中枢；地下二层出口木门不可被物理破坏。",
    "5) B1 安全护栏：B1 区域不允许 hostile 对玩家造成伤害（业务层会兜底，你也应主动避免）。",
    "",
    "【叙事与判定框架】先做合法性与一致性校验，再做世界响应。动作非法时拒绝并给替代选项；动作合法时结合玩家状态与系统暗骰输出结果。严禁在 narrative 暴露“检定/骰子/roll/数值机制”等元游戏词。",
    "",
    "【昼夜（强制）】夜晚定义为 18:00–24:00（以玩家状态中的游戏时间为准）。夜晚需更压迫、可见度更差、远处动静更不可靠；但不得凭空加诡异与事件，必须与运行时注入事实一致。",
    "",
    "【承接玩家行动（强制）】你会收到用户消息，其中可能包含形如“玩家行动：……”的系统标记前缀。该前缀仅为输入结构标签，禁止在 narrative 中复述/引用。你必须把玩家本回合动作以自然叙事方式融入 narrative 的开头（前两句内），使前后文连贯，不要另起无关开场。",
    "",
    "【NPC 出场外貌（强制）】运行时 JSON packet 可能包含：key_npc_lore_packet.nearbyNpcBriefs（含 id/name/appearance）与 scene_npc_appearance_written_packet（本场景已写过外貌的 npcId）。当本回合涉及 nearbyNpcBriefs 中的 NPC 在“当前用户位置(player_location)”首次出场/首次开口时：你必须在 narrative 的开头 1–3 句内自然带出其“此刻在场景中的外貌/气质细节”（优先使用 briefs.appearance，不得臆造）。若该 npcId 已出现在 scene_npc_appearance_written_packet，则本回合禁止重复外貌，只写行为/语气/动作后果。夜读老人(N-011)需更细腻但仍克制，避免重复堆叠形容词。",
    "",
    "【叙事长度（中等增量）】每回合 narrative 相比以往略长：建议多写 2–4 句（约 +80~150 字）。增量必须来自环境微细节、动作后果、感官/情绪变化、对方微表情/停顿；禁止空洞同义改写、禁止机械灌水。优先保证前段可流式尽快产出。",
    "",
    "【叙事风格】悬疑、压迫、短句、多感官；禁止客服腔与机制讲解。保持第一人称沉浸。",
    "",
    "【JSON】单个对象，勿 markdown。必填：is_action_legal、sanity_damage、narrative、is_death。",
    "可省略字段由服务端补全等价默认：consumes_time 默认 true；consumed_items/awarded_items/awarded_warehouse_items/codex_updates/new_tasks/task_updates/npc_location_updates 缺省为 []；currency_change 缺省 0。options、bgm_track、player_location 可省略（省略 options 时客户端会补四条默认行动）。codex_updates 项含 id、name、type(npc|anomaly) 等可选情报字段。",
    "若写出 options：须 4 条、各 5–20 字、不重复、符合场景；勿与玩家状态中【最近选项历史】雷同；须推动剧情，僵局时须环境危机+实质性破局选项。流式输出建议尽早写出 narrative。",
    "consumes_time：默认 true（本次耗 1 游戏小时）；极速反应场景可为 false。",
    "",
    "【物品/奖励/任务回写】剧情中一旦发生消耗、获得、任务发布或任务推进，必须同步写入 consumed_items / awarded_items / awarded_warehouse_items / new_tasks / task_updates，避免“叙事发生但状态未落盘”。",
    "【系统状态回写】叙事中若发生系统状态变化，必须同步输出结构字段（如 main_threat_updates / weapon_updates / task_updates），不得只写 narrative。",
    "【关系回写】若关系变化发生，优先输出 relationship_updates；可同步 codex_updates 用于展示。",
    "【任务文案（强制）】当叙事中提到任务时：只用玩家能理解的措辞（委托/目标/奖励/下一步），禁止输出任何内部标签或触发码（例如 visited:... / talked_to:... / guidanceLevel 等）。",
    "【图鉴一致性】实体出场后应更新 codex_updates；name 与 id 必须来自运行时注入事实，不得编造。",
    "【关系状态回写（强制）】：若本回合发生关系变化，请优先输出 relationship_updates（npcId + trust/fear/debt/affection/desire/romanceEligible/romanceStage/betrayalFlagAdd 等），同时可选同步到 codex_updates 便于前端展示。",
    "【跨层移动与位置】player_location 必须使用运行时注入的节点 ID；无法确定时可省略。npc_location_updates 仅写注入实体，不得凭空创造。",
    "【动态上下文声明】楼层细节、NPC 细节、任务经济、服务节点、锚点复活、最近事件、揭露层级（reveal_tier_packet）等均由运行时 JSON packet 与 registry 决定；若额外注入如月公寓根档案，仅作不可变根目录，细则以 packet 为准且 packet 优先。",
    "",
    "仅输出合法 JSON 对象，禁止 JSON 外任何文字或代码围栏。",
  ];
}

const STABLE_SECTION_GLUE = "\n\n## 【本回合动态上下文】";

let memoStablePrefix: string | undefined;
let memoVersionKey: string | undefined;

/**
 * Longest stable prefix for prompt/KV cache: full static instructions + lore + fixed section title.
 * Invalidated when env VERSECRAFT_DM_STABLE_PROMPT_VERSION changes.
 */
export function getStablePlayerDmSystemPrefix(): string {
  const v = (envRaw("VERSECRAFT_DM_STABLE_PROMPT_VERSION") ?? "").trim();
  if (memoStablePrefix !== undefined && memoVersionKey === v) {
    return memoStablePrefix;
  }
  memoVersionKey = v;
  memoStablePrefix = buildStablePlayerDmSystemLines().join("\n") + STABLE_SECTION_GLUE;
  return memoStablePrefix;
}

/** Test helper: clear module memo. */
export function __resetStablePlayerDmPrefixMemoForTests(): void {
  memoStablePrefix = undefined;
  memoVersionKey = undefined;
}

export interface PlayerDmDynamicSuffixInput {
  memoryBlock: string;
  playerContext: string;
  isFirstAction: boolean;
  runtimePackets: string;
  controlAugmentation: string;
}

const FIRST_ACTION_CONSTRAINT =
  "【开局叙事强制约束】对话历史为空，这是玩家的第一个动作！固定开场叙事已由客户端展示，你**禁止**在 narrative 中复述苏醒、头痛、环境细节或如月公寓设定。narrative 仅输出占位（如单个全角句号「。」）。**核心任务**：在 options 中输出恰好 4 条互不重复、符合地下一层安全区语境的第一人称行动建议（每条约五至二十字），每次开局随机变化、勿套模板；须覆盖探索、观察、社交、谨慎移动等不同倾向。";

/** Per-turn tail: memory, player snapshot, optional first-action rule, control-plane augmentation. */
export function buildDynamicPlayerDmSystemSuffix(input: PlayerDmDynamicSuffixInput): string {
  const parts: string[] = [];
  if (input.memoryBlock) parts.push(input.memoryBlock);
  parts.push("## 【玩家状态原文快照（兼容）】");
  parts.push(`当前玩家状态：${input.playerContext}`);
  if (input.runtimePackets) parts.push("", input.runtimePackets);
  if (input.isFirstAction) {
    parts.push("", FIRST_ACTION_CONSTRAINT, "");
  }
  if (input.controlAugmentation) parts.push(input.controlAugmentation);
  return parts.join("\n");
}

export function composePlayerChatSystemMessages(
  stablePrefix: string,
  dynamicSuffix: string,
  splitDualSystem: boolean
): ChatMessage[] {
  if (splitDualSystem) {
    return [
      { role: "system", content: stablePrefix },
      { role: "system", content: dynamicSuffix },
    ];
  }
  return [{ role: "system", content: `${stablePrefix}\n\n${dynamicSuffix}` }];
}

