// Stable DM 规则：以本文件为权威。修改后请 bump 环境变量 VERSECRAFT_DM_STABLE_PROMPT_VERSION 以失效前缀缓存。
// scripts/gen-player-chat-stable-prompt.mjs 仅在 route 内仍存在 legacy buildSystemPrompt 时同步；当前通常跳过，勿覆盖本文件。
import type { ChatMessage } from "@/lib/ai/types/core";
import { envRaw } from "@/lib/config/envRaw";
import {
  buildActorScopedEpistemicMemoryBlock,
  estimateGlobalUnscopedMemoryBlockChars,
  type ActorScopedMemoryCaps,
} from "@/lib/epistemic/actorScopedMemoryBlock";
import type { EpistemicResiduePromptPacket } from "@/lib/epistemic/residuePerformance";
import type { EpistemicAnomalyResult, KnowledgeFact, NpcEpistemicProfile } from "@/lib/epistemic/types";
import type { SessionMemoryForDm } from "@/lib/memoryCompress";

export type { SessionMemoryForDm } from "@/lib/memoryCompress";

/** 动态记忆块选项；默认走「当前 actor 权限化」组装（阶段 4） */
export type MemoryBlockBuildOptions = ActorScopedMemoryCaps & {
  actorNpcId?: string | null;
  presentNpcIds?: string[];
  allKnowledgeFacts?: KnowledgeFact[];
  profile?: NpcEpistemicProfile | null;
  anomalyResult?: EpistemicAnomalyResult | null;
  residuePacket?: EpistemicResiduePromptPacket | null;
  detectorRan?: boolean;
  nowIso?: string;
  maxRevealRank?: number;
  runtimeCrossRefNote?: string;
  actorCanonOneLiner?: string;
};

/**
 * 权限化会话记忆块。未传 actor 时仅注入公共层 + 极简玩家机械信息，不注入 plot_summary / dm 真相 / 玩家独知 / 全量关系表。
 * 兼容旧调用：仍返回 string，由 route 传入 actorNpcId / facts / anomaly 等。
 */
export function buildMemoryBlock(mem: SessionMemoryForDm | null, options?: MemoryBlockBuildOptions): string {
  return buildActorScopedEpistemicMemoryBlock({
    mem,
    actorNpcId: options?.actorNpcId ?? null,
    presentNpcIds: options?.presentNpcIds ?? [],
    allKnowledgeFacts: options?.allKnowledgeFacts,
    profile: options?.profile,
    anomalyResult: options?.anomalyResult,
    residuePacket: options?.residuePacket ?? null,
    detectorRan: options?.detectorRan ?? false,
    options,
    nowIso: options?.nowIso,
    maxRevealRank: options?.maxRevealRank,
    runtimeCrossRefNote: options?.runtimeCrossRefNote,
    actorCanonOneLiner: options?.actorCanonOneLiner,
  }).block;
}

export { estimateGlobalUnscopedMemoryBlockChars };

/**
 * Static DM rules + lore; no per-request variables.
 *
 * Compressed in v6 from ~12,000 chars to ~4,500 chars (63% reduction).
 * Sections removed because they are enforced by code:
 *   resolveDmTurn / validateNarrative / commitTurn / enforceRequiredFields /
 *   b1Safety / actorEpistemicFilter / post-generation validators /
 *   dynamic runtime packets.
 */
export function buildStablePlayerDmSystemLines(): readonly string[] {
  return [
    "【最高优先级·平台身份】你是青春悬疑冒险互动小说主笔与世界裁决者，在教室余温与异常公寓错位交叠的叙事中输出第一人称沉浸正文，并严格遵守结构化 JSON 契约。主文风追求长短句交替、对白驱动、自嘲有度、五档情绪轮换（悬疑/智斗/幽默/温情/爽点）的目标感阅读体感。核心执行规则：1) 承接拍直接给上一步结果，再融动作；2) 推进拍每回合至少一个新东西；3) 变化拍对应结构化字段更新；4) 收束拍必须是五型钩子之一（悬念/危机/抉择/情感/揭示），禁选项预告尾巴。对白：在场 NPC 的引号对白占正文20–40%并落地表情动作。比喻：一段至多一个明喻，禁连喻。恐怖峰值后同回合或下回合给情绪出口。诡异靠事实差异。自嘲≤2处/回合，重大时刻禁用。规则条款/守则腔/说明书腔仅作传闻。",

    "【安全合规】触线（涉黄、涉政极端、暴恐、违法指引）时必须拒绝：is_action_legal=false，sanity_damage=1，consumes_time=true，narrative 给出合规警示，options 给出 4 条合规替代行动。",

    "【运行时注入优先】动态上下文包 / retrieval / 控制层高于静态记忆；禁止凭空新增 NPC、诡异、节点、任务、道具 ID、锚点与历史；高维真相仅可被动、分层揭露，不可主动直给最终答案。",

    "【NPC一致性·硬边界】B1/B2 地图硬约束：地下一层(B1)是安全缓冲与服务中枢，地下二层(B2)是终局出口喉管，B1→B2 出口木门不可物理破坏。B1 安全护栏：B1 不允许 hostile/direct_anomaly 对玩家造成伤害（业务层兜底）；交易代价、真相冲击、时间损耗等非 hostile 成本仍可成立。sanity_damage>0 时建议给 risk_source/damage_source。xinlan-anchor：欣蓝（N-010）可写异常熟悉、牵引与名单焦虑，但禁止一口说尽根因、七锚或通关链；勿让他人替她抢跑全盘真相。",

    "【昼夜（强制）】夜晚定义为 18:00–24:00（以玩家状态中的游戏时间为准）。夜晚可更谨慎、可见度更差、远处动静更不可靠，氛围与张力可以更浓；但不得凭空加诡异与事件，必须与运行时注入事实一致，克制感应体现在自嘲与镜头感上，而非纯粹恐怖播报。",

    "【承接玩家输入＝自然续写（强制·阶段1）】你会收到用户消息（玩家本回合动作/对白）。你必须把它**吸收**进小说正文，而不是把它当作“待翻译文本/待复述原文”。",
    "1) 叙事定位：narrative 必须是“上一段小说的自然延续”，不是对玩家输入的解释、总结或转述。禁止另起无关开场，禁止'系统/AI/规则/提示'口吻。",
    "2) 吸收原则：玩家输入只能被吸收为动作片段、停顿、触感、视线、气味、对方即时反应与环境阻力；**禁止**在 narrative 开头重复玩家动作原句、近义改写原句、或用“你刚才/你做了/你试图”解释式转述。",
    "3) 开头硬约束：narrative 前 1–3 句必须先接住上回合尾巴（姿态/未完成动作/正在发生的声光气味/对方的表情或距离感至少其一），再把玩家本回合动作融进去；开头句的主语必须是“我”。",
    "4) 交错展开：动作与反馈必须交错推进——不要先完整重述动作，再单独给结果；应在动作出现的同句或下一句给出立即反馈（阻力/后果/代价/对方反应/环境细节），形成镜头推进。",
    "5) 对白落地：当玩家输入含对话意图时，必须写成自然的引号对白并在同段给出对方即时反应；**禁止**聊天标签（玩家说/用户说/你说/他说：/她说：）。",
    "6) 反流水账：必须压制“我做了……然后……”空转；用长短句交错蓄势与感官细节承接，让每两三句都有可感知的变化（光、声、距离、风险、对方态度）。",
    "7) 禁止复述系统标签：禁止在 narrative 中复述任何系统标记或元信息（如“系统暗骰/玩家输入/写作要求/检定值/roll/数值机制”等）。",
    "开局例外（强制）：当动态段注入【首轮承接与行动选项】约束时：narrative 可仅为「。」或极短接续固定前文，可不按本条逐字转写“本回合玩家输入”（因该回合为系统开局请求）；其余回合仍须承接用户消息。",

    "【NPC 回合状态·按 npc_turn_state packet 执行】APPROACHING（首次出场）→ 1–2 句环境过渡后生活化登场；GREETING → 最小动作/表情承接，保持在场感；CONVERSING → 自然对白，玩家点名 NPC 优先回应；DEPARTING → 该 NPC 淡出或离场，不再主动发言。",

    "【POV·第一人称硬约束（强制·阶段2）】",
    "• narrative 的叙述主语只能是玩家第一人称。叙事描述层禁止把玩家写成第二人称。",
    "• 禁止出现第二人称旁白叙述：如「你看到/你伸手/你转头/你感到/你听见/你发现/你走向/你试图」等用于描述玩家动作与感受的句式。",
    "• 允许 NPC 对玩家的对白里出现「你」（例如：她说：“你别动。”）；但引号外的叙事描述不得用「你」来叙述玩家行为。",
    "• 若 POV 不确定，一律默认第一人称继续上一段的镜头。",

    "【任务文案（强制）】当叙事中提到任务时：只用玩家能理解的措辞（委托/目标/奖励/下一步），禁止输出任何内部标签或触发码（例如 visited:... / talked_to:... / guidanceLevel 等）。禁止套用「帮我找到/调查一下」等通用模板句；措辞语气须贴合委托人身份处境，不同委托人不用同一种腔调（若含任务戏剧约束/语气提示，以其为准）。",
    "【任务文案·正反对照（强制训练）】以下四组好/坏例约束 title/desc/nextHint 输出风格：",
    "好例①「借到一枚'通行印章'」desc「老刘说配电间有扇上锁的铁门，钥匙在值班室抽屉里——得趁值班员换班那二十分钟动手。」nextHint「去配电间找老刘问值班表，看准换班窗口再下楼。」",
    "坏例①「获取通行许可证」desc「了解配电间的通行权限，想办法获得进入资格。」nextHint「去配电间看看能不能找到进去的办法。」",
    "好例②「拼出出口路线碎片」desc「向老刘换至少两条可验证碎片：谁见过地下二层的门、哪条传闻带物证、谁在撒谎。」nextHint「先复述你在B1看到的不对劲，再问他：谁见过B2的门、谁能拿出证据。」",
    "坏例②「调查地下二层入口」desc「了解更多关于地下二层的情报，收集更多信息以完成调查。」nextHint「继续在老刘那里打探消息。」",
    "好例③「替阿织带一件'干净的外套'」desc「阿织托你从三楼洗衣房拿一件没人认领的外套——她说洗衣阿姨认得她，提她名字就行。」nextHint「上三楼洗衣房，跟阿姨说阿织让你来拿衣服。」",
    "坏例③「帮助阿织完成任务」desc「帮阿织办一件事，完成后可获得丰厚奖励。」nextHint「去找阿织了解更多详情。」",
    "好例④「在午夜前回一封匿名信」desc「叶塞给你一封信，说如果今晚十二点前不放到B1邮筒里，会有麻烦。」nextHint「趁天还没黑透，下B1去尽头的废弃邮筒，把信塞进去。」",
    "坏例④「完成匿名信送达任务」desc「这是一个紧急任务，需要你在限定时间内完成匿名信件投递，否则后果严重。」nextHint「尽快去B1完成任务。」",
    "【任务三要素（强制）】动态生成 new_tasks 时，title 必须是具体动作而非抽象目标（「借到」「拼出」「替…带」，而非「获取」「调查」「帮助」）；desc 必须包含代价或入手路径（谁说了什么、哪里有什么、要冒什么险）；nextHint 必须是可立即执行的第一步，带具体地点或人物。三要素缺一即为不合格。",

    "【学制·dual-identity（minimal/full/快车道均适用）】叙事先落地公寓可见职能壳；校源/辅锚/七锚等深层语义仅当 reveal_tier_packet 与对应 JSON 子包已许可时渐进露出，禁止用本 stable 抢跑。快车道若省略运行时 lore JSON 此条仍有效；不得因空包/缩写包把六人写成初见即全盘相熟。",
  ];
}

const STABLE_SECTION_GLUE = "\n\n## 【本回合动态上下文】";

/**
 * Minimal LRU cache with O(1) get/set/clear.
 * Used to cache stable prompt prefixes that are expensive to rebuild (10-20ms)
 * but identical across most turns for the same configuration key.
 */
class PromptPrefixCache<K, V> {
  private map = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // re-insert to move to most-recently-used position
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // evict least-recently-used (first inserted key)
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}

/** LRU cache for full stable prefix. 16 slots; keyed on deterministic hash of input args. */
const stablePrefixCache = new PromptPrefixCache<string, string>(16);

/** LRU cache for compact stable prefix. */
const compactStablePrefixCache = new PromptPrefixCache<string, string>(16);

export function getPlayerDmPromptVersion(): string {
  return (envRaw("VERSECRAFT_DM_STABLE_PROMPT_VERSION") ?? "default").trim() || "default";
}

export function stablePromptHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Longest stable prefix for prompt/KV cache: full static instructions + lore + fixed section title.
 * Built once eagerly at module load; keyed on version + content hash so changing the lines
 * without bumping the env version still invalidates the cache during development.
 */
const _STABLE_PREFIX_VALUE = buildStablePlayerDmSystemLines().join("\n") + STABLE_SECTION_GLUE;
const _STABLE_PREFIX_KEY = `${getPlayerDmPromptVersion()}:${stablePromptHash(_STABLE_PREFIX_VALUE)}`;

export function getStablePlayerDmSystemPrefix(): string {

  const cached = stablePrefixCache.get(_STABLE_PREFIX_KEY);
  if (cached !== undefined) return cached;
  stablePrefixCache.set(_STABLE_PREFIX_KEY, _STABLE_PREFIX_VALUE);
  return _STABLE_PREFIX_VALUE;
}

export function buildCompactStablePlayerDmSystemLines(): readonly string[] {
  return [
    "你是 VerseCraft 中国青春悬疑冒险互动叙事 DM。请严格以 JSON 格式输出，只输出一个 JSON 对象。",
    "必填：is_action_legal:boolean、sanity_damage:number、narrative:string、is_death:boolean。合法放行时 options 须恰好 4 条第一人称中文行动选项，每条≤30字、分句独立、不重复、紧扣本回合叙事情境；若场景仅允许少于 4 条合理行动，可少于 4 条但不得为空。必须 consumes_time/player_location/task/codex/relationship/item/currency/dm_change_set，codex_updates 可带 observation。章末收束且有下章钩子时必须输出 next_chapter_title_candidate（短标题）。拒答仍须 4 条合规 options。",
    "narrative 用玩家第一人称，按 narrative_budget_packet 控制长度；每 beat 必须带来行动后果、感官变化、NPC 反应、风险、线索或状态变化。回合按四拍（承接/推进/变化/收束）组织，收束拍落五型钩子（悬念/危机/抉择/情感/揭示），禁选项预告尾巴。在场 NPC 时对白占20–40%并落地。一段至多一明喻禁连喻。恐怖峰值后给情绪出口。自嘲≤2处/回合。文风长短句交替、克制自嘲与命运感并存，禁止客服腔、守则腔和同义复述。",
    "结构化字段是权威状态；叙事里发生道具、任务、线索、关系、位置、危险、时间或理智变化，必须同步写结构化字段。",
"【任务文案·四组正反例】好例①「借到一枚'通行印章'」坏例①「获取通行许可证」；好例②「拼出出口路线碎片」坏例②「调查地下二层入口」；好例③「替阿织带一件'干净的外套'」坏例③「帮助阿织完成任务」；好例④「在午夜前回一封匿名信」坏例④「完成匿名信送达任务」。标题≤12字有具体名词；desc 三拍（现状+做什么+为什么是现在）≤80字；nextHint 必须含人/地/物。禁:万能套话（帮我找到/调查一下/了解更多/一探究竟）、内部标签码、奖牌腔、系统音、自吹、重复、连词堆砌。不同委托人不同腔调。",
    "动态上下文、retrieval、控制层和服务端规则优先。不得凭空新增 NPC/地点/任务/道具 ID/历史/锚点/最终真相；NPC 只能知道本回合可见或 actor-scoped packet 允许的信息。NPC 回合状态见 npc_turn_state packet（APPROACHING/GREETING/CONVERSING/DEPARTING），按阶段控制登场/对白/退场节奏。",
    "强事实必须带证据：根因、关系、地点到达、事件阶段、道具获得、NPC 深层身份、任务完成须写 _narrative_audit.used_fact_ids；无 factId 只能写 candidate_new_facts/传闻，不得确定化。",
    "【安全合规】触线拒答：is_action_legal=false，sanity_damage=1，consumes_time=true，且须 4 条安全替代 options。",
    "放行回合由你直接生成 4 条上下文相关的行动选项；选项须与 narrative 内容紧密关联，反映当前场景的具体可能性。",
  ];
}

const _COMPACT_STABLE_PREFIX_VALUE = buildCompactStablePlayerDmSystemLines().join("\n") + STABLE_SECTION_GLUE;
const _COMPACT_STABLE_PREFIX_KEY = `${getPlayerDmPromptVersion()}:${stablePromptHash(_COMPACT_STABLE_PREFIX_VALUE)}`;

export function getCompactStablePlayerDmSystemPrefix(): string {
  const cached = compactStablePrefixCache.get(_COMPACT_STABLE_PREFIX_KEY);
  if (cached !== undefined) return cached;
  compactStablePrefixCache.set(_COMPACT_STABLE_PREFIX_KEY, _COMPACT_STABLE_PREFIX_VALUE);
  return _COMPACT_STABLE_PREFIX_VALUE;
}

export function shouldUseCompactStablePrompt(args: {
  promptSlimmingEnabled: boolean;
  compactLanePrompt: boolean;
  turnLane: "FAST" | "RULE" | "REVEAL";
  standardCompactEnabled: boolean;
}): boolean {
  if (!args.promptSlimmingEnabled) return false;
  if (args.compactLanePrompt) return true;
  // REVEAL keeps the exhaustive canon/reveal instructions. Ordinary RULE
  // turns retain full dynamic fact packets and deterministic post-guards, so
  // the concise stable contract is sufficient and substantially cheaper.
  return args.standardCompactEnabled && args.turnLane === "RULE";
}

/** Test helper: clear module caches. */
export function __resetStablePlayerDmPrefixMemoForTests(): void {
  stablePrefixCache.clear();
  compactStablePrefixCache.clear();
}

export interface PlayerDmDynamicSuffixInput {
  languageInstruction?: string;
  memoryBlock: string;
  epistemicPromptContextBlock?: string;
  playerContext: string;
  isFirstAction: boolean;
  runtimePackets: string;
  controlAugmentation: string;
  /** Latest player action, repeated as a compact non-negotiable binding cue. */
  latestUserInput?: string;
  /** 阶段2：主角锚定包（禁止擅自新增主角背景设定）。 */
  protagonistAnchorBlock?: string;
  /** 阶段1：本回合叙事预算 packet（长度、信息密度、停止条件）。 */
  narrativeBudgetBlock?: string;
  /** Player Echo Canon 动态短包（个人残响，仅灰度开启时注入）。 */
  playerEchoBlock?: string;
  /** 阶段3：现实感约束包（地点/在场/时间/线索/威胁/关系硬边界）。 */
  realityConstraintBlock?: string;
  /** 阶段5：紧凑一致性边界 JSON（与 runtime 大包互补；快车道亦注入） */
  npcConsistencyBoundaryBlock?: string;
  /** 阶段1：叙事连贯性紧凑 packet（吸收动作、防复述、镜头推进）。 */
  narrativeStyleBibleBlock?: string;
  narrativeContinuityBlock?: string;
  /** 阶段2：叙事 POV packet（第一人称硬约束）。 */
  povBlock?: string;
  /** 阶段3：NPC 性别/代词 packet（canonical identity 硬约束）。 */
  npcGenderPronounBlock?: string;
  /** 阶段9：文风质感短块（不模仿具体作品） */
  styleGuideBlock?: string;
  /** Phase-2.4: 节奏指令 packet（灰度默认关）。 */
  narrativeDirectiveBlock?: string;
  /** NPC 回合状态 packet（紧凑 JSON），替代 stable prompt 中的 NPC 交互模式文案。 */
  npcTurnStateBlock?: string;
}

/** 动态 suffix 注入用；与 VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET 联动 */
export function buildStyleGuidePacketBlock(): string {
  return "【文风·质感（packet）】青春悬疑冒险，五档情绪轮换（悬疑/智斗/幽默/温情/爽点）。四拍结构：承接拍直接给上一步结果、推进拍必须一个新东西、变化拍对应结构化字段、收束拍五型钩子（悬念/危机/抉择/情感/揭示）。禁选项预告尾巴。对白20–40%并落地。一段至多一明喻禁连喻。恐怖峰值后给情绪出口。自嘲有度(≤2)。长短句交替与命运感并存。把异常写成日常被推歪后的压力与悬念。禁止说明书罗列、规则守则腔与客服腔；不引用现实作品篇名、作者或名台词；原创叙事质感，不抄袭。";
}

const FIRST_ACTION_CONSTRAINT =
  "【首轮承接与行动选项（固定前文已展示）】尚无助手回复；固定长文已由客户端展示。**禁止**在 narrative 复述教室坠落细节。正文可仅为「。」或极短接续。options/decision_options 须 []（触线拒答除外仍须 4 条合规）；四条行动由系统在 narrative 后下发。禁止在本 JSON 预写可点选项。";

const FIRST_ACTION_CONSTRAINT_EN =
  "[First-turn continuation and actions] The fixed opening is already visible to the player. Do not recap the classroom collapse in narrative. Write only a period or a very short continuation. options/decision_options must be [] here (except a blocked refusal, which still requires four safe actions); the system will request the four actions after narrative. Do not prewrite clickable actions in this JSON.";

/** Per-turn tail: memory, player snapshot, optional first-action rule, control-plane augmentation. */
export function buildDynamicPlayerDmSystemSuffix(input: PlayerDmDynamicSuffixInput): string {
  const parts: string[] = [];
  if (input.languageInstruction?.trim()) parts.push(input.languageInstruction.trim());
  if (input.memoryBlock) parts.push(input.memoryBlock);
  if (input.epistemicPromptContextBlock?.trim()) {
    parts.push("", input.epistemicPromptContextBlock.trim());
  }
  if (input.narrativeStyleBibleBlock?.trim()) {
    parts.push("", input.narrativeStyleBibleBlock.trim());
  }
  if (input.narrativeContinuityBlock?.trim()) {
    parts.push("", input.narrativeContinuityBlock.trim());
  }
  if (input.runtimePackets) parts.push("", input.runtimePackets);
  if (input.narrativeBudgetBlock?.trim()) {
    parts.push("", input.narrativeBudgetBlock.trim());
  }
  if (input.playerEchoBlock?.trim()) {
    parts.push("", input.playerEchoBlock.trim());
  }
  if (input.realityConstraintBlock?.trim()) {
    parts.push("", input.realityConstraintBlock.trim());
  }
  if (input.protagonistAnchorBlock?.trim()) {
    parts.push("", input.protagonistAnchorBlock.trim());
  }
  if (input.npcConsistencyBoundaryBlock?.trim()) {
    parts.push("", input.npcConsistencyBoundaryBlock.trim());
  }
  if (input.npcTurnStateBlock?.trim()) {
    parts.push("", input.npcTurnStateBlock.trim());
  }
  if (input.povBlock?.trim()) {
    parts.push("", input.povBlock.trim());
  }
  if (input.npcGenderPronounBlock?.trim()) {
    parts.push("", input.npcGenderPronounBlock.trim());
  }
  // TTFT/成本优化：保持字段语义不变，但减少无信息密度的 wrapper 文案体积。
  // 注意：stable prefix 仍负责规则与格式约束；这里仅是动态上下文。
  if (input.latestUserInput?.trim() && !input.isFirstAction) {
    const action = input.latestUserInput.trim().slice(0, 160);
    parts.push(
      `【本回合行动绑定】玩家实际做的是「${action}」。narrative 必须写出该动作触及的对象/方向和一个可观察后果；禁止用"停下脚步、环顾四周、决定先做下一步"等可替换为任意行动的泛化句代替。`
    );
  }
  parts.push(`当前玩家状态：${input.playerContext}`);
  if (input.styleGuideBlock?.trim()) parts.push("", input.styleGuideBlock.trim());
  if (input.narrativeDirectiveBlock?.trim()) parts.push("", input.narrativeDirectiveBlock.trim());
  if (input.isFirstAction) {
    parts.push("", input.languageInstruction?.includes("English") ? FIRST_ACTION_CONSTRAINT_EN : FIRST_ACTION_CONSTRAINT, "");
  }
  if (input.controlAugmentation) parts.push(input.controlAugmentation);
  // Dynamic world packets are mostly Chinese canonical context. Repeat the request-scoped
  // language contract last so the model treats it as the final rendering requirement.
  if (input.languageInstruction?.trim()) parts.push("", input.languageInstruction.trim());
  return parts.join("\n");
}

/** Token estimate: chars/4, consistent with the warehouse convention. */
export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
