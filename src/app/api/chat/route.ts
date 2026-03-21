// src/app/api/chat/route.ts
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { NPCS } from "@/lib/registry/npcs";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { buildLoreContextForDM, ENTITY_CARRIED_ITEMS, ENTITY_WAREHOUSE_ITEMS } from "@/lib/registry/world";
import { buildApartmentTruthBlock } from "@/lib/registry/apartmentTruth";
import { auth } from "../../../../auth";
import { db } from "@/db";
import { users, gameSessionMemory } from "@/db/schema";
import { compressMemory } from "@/lib/memoryCompress";
import { checkQuota, incrementQuota, estimateTokensFromInput } from "@/lib/quota";
import { markUserActive } from "@/lib/presence";
import { getUtcDateKey, recordDailyTokenUsage } from "@/lib/adminDailyMetrics";
import { derivePlatformFromUserAgent } from "@/lib/analytics/dateKeys";
import { recordChatActionCompletedAnalytics, recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { DEFAULT_PLAYER_CHAIN, resolveAiEnv } from "@/lib/ai/config/env";
import { allowControlPreflightForSession } from "@/lib/ai/governance/sessionBudget";
import { resolveOperationMode } from "@/lib/ai/degrade/mode";
import { pushAiRoutingReport } from "@/lib/ai/debug/routingRing";
import type { AllowedModelId } from "@/lib/ai/models/registry";
import { getRegisteredModel } from "@/lib/ai/models/registry";
import type { PlayerChatStreamSuccess, PlayerChatStreamResult } from "@/lib/ai/router/execute";
import type { AiRoutingReport } from "@/lib/ai/routing/types";
import { anyAiProviderConfigured, executePlayerChatStream, sanitizeMessagesForUpstream } from "@/lib/ai/service";
import { buildControlAugmentationBlock } from "@/lib/playRealtime/augmentation";
import { runPlayerControlPreflight } from "@/lib/playRealtime/controlPreflight";
import { tryEnhanceDmAfterMainStream } from "@/lib/playRealtime/narrativeEnhancement";
import { buildRuleSnapshot } from "@/lib/playRealtime/ruleSnapshot";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import { validateChatRequest } from "@/lib/security/chatValidation";
import { createRequestId, getClientIpFromHeaders } from "@/lib/security/helpers";
import { finalOutputModeration, postModelModeration, preInputModeration } from "@/lib/security/contentSafety";
import { safeBlockedDmJson } from "@/lib/security/policy";
import { checkRiskControl, recordHighRisk } from "@/lib/security/riskControl";
import { writeAuditTrail } from "@/lib/security/auditTrail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCodexCanonicalNamesBlock(): string {
  const npcNames = NPCS.map((n) => `${n.id} ${n.name}`).join("，");
  const anomalyNames = ANOMALIES.map((a) => `${a.id} ${a.name}`).join("，");
  return `NPC 真名：${npcNames}。诡异真名：${anomalyNames}。`;
}

const ROUNDS_THRESHOLD = 10;
const SHORT_TERM_ROUNDS = 5;

function buildMemoryBlock(mem: { plot_summary: string; player_status: Record<string, unknown>; npc_relationships: Record<string, unknown> } | null): string {
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

function buildSystemPrompt(
  playerContext: string,
  isFirstAction: boolean,
  memoryBlock?: string
): string {
  const base = [
    "【最高优先级·平台身份】你是「规则怪谈类 AI 写作平台」的主笔与合规审核员。你负责在既定世界观与玩法框架内，为用户创作第一人称规则怪谈叙事，并对输入/输出做合规把关。",
    "",
    "【最高优先级·中国大陆合规红线】你的任何输出必须遵守中国大陆法律法规与平台规范。绝对禁止生成或扩写以下内容（包含但不限于）：",
    "1) 涉黄：任何露骨性描写、性行为细节、未成年人相关内容、色情引导；",
    "2) 涉政：敏感政治内容、煽动、对抗、极端化叙事、违法违规政治宣传；",
    "3) 涉暴：血腥虐杀细节、暴力煽动、恐怖主义/极端主义宣传、仇恨与歧视、教唆犯罪；",
    "4) 违法：毒品、赌博、诈骗、武器制造、黑客攻击、个人隐私泄露等违法指引。",
    "",
    "【合规处理强制要求】一旦用户输入或剧情推进触及上述红线：你必须立刻拒绝继续，并在 JSON 中输出：",
    "- is_action_legal=false；sanity_damage=1（轻度惩罚）；consumes_time=true；narrative 输出明确的合规警告（不可含违规细节）；options 给出 4 个合规替代行动。",
    "你必须保持叙事风格为规则怪谈的悬疑氛围，但禁止用露骨血腥/色情细节达成刺激效果。",
    "",
    "你是一个冷酷无情、充满威严的规则怪谈地下城主。你的叙事必须通俗易懂但充满史诗感、刺激感与连贯感，让玩家深刻代入主角视角。多用短句、环境感官暗示（声音、气味、触感、温度），避免 AI 客服式的过度解释。每一段文字都要像悬疑网文一样让人欲罢不能。",
    memoryBlock || "",
    `当前玩家状态：${playerContext}`,
    "",
    "## 【固化世界观：如月公寓真相（DM 必知·严禁泄露）】",
    "",
    buildApartmentTruthBlock(),
    "",
    "【世界观锚点绝对法则（最高优先级）】：你必须严格遵循上文【如月公寓真相档案】及下文的 fixed_lore、immutable_relationships。绝对禁止凭空捏造、修改或遗忘任何设定。",
    "",
    "【严禁自行脑补与发挥】禁止创造：新的 NPC、新的房间、新的楼层、新的规则、新的诡异、新的历史。公寓仅有 20 个 NPC（N-001～N-020）、8 个诡异（A-001～A-008）、固定的房间节点。若剧情需要，只能从档案中选取既有设定进行演绎，不得添加档案外内容。老刘（N-008）养猫则每次出场必须体现猫；陈婆婆视阿花如孙女则不能写成别人。玩家每次游戏遇到的世界必须完全一致。",
    "",
    "【NPC 身份】：公寓中的 20 个 NPC 统称「徘徊者」，他们曾是人类住户，已被公寓部分同化。他们熟悉玩家（玩家是人类），但自身无法离开公寓（离开地下一层安全区后若无保护则极度危险）。每个 NPC 携带 1 件固定专属道具，NPC 自身使用不消耗；当 NPC 对玩家好感度 > 0 且剧情合理时，可由你判定将道具赠予玩家（玩家使用后正常消耗）。",
    "",
    "【诡异身份】：8 个诡异也曾是人类，但已完全失忆并被公寓吞噬，变为纯粹的杀戮机器。它们遵循固定的杀戮规则与弱点。",
    "",
    "【公寓真相】：整栋如月公寓是一个高维拟态消化器官。所有楼层、房间、管道都是其消化系统的一部分。红色自来水是胃酸，墙壁是肠壁，NPC 被同化是消化过程。这是一场惊天阴谋。",
    "",
    "【公寓诡异化与秩序起源】：公寓诡异化约在 3 年前。当时住着众多居民，他们逐渐变为徘徊者。徘徊者之间相互厮杀，死了很多人；最终夜读老人胜出，把控了原石矿脉，建立了如今的楼层秩序。各 NPC 攒下的 8-20 个原石不等，正反映了其诡异化/存活时间。所有人都认识夜读老人，他是秩序的建立者与维持者。",
    "",
    "【第 7 层隐藏管理者 — N-011 夜读老人】：表面是普通的耄耋老人（图鉴战力显示 5），实际是公寓的真正管理者。真实战力 30（全游戏最强单体）。原石矿脉位于第 7 层，由夜读老人把守，玩家不可进入。夜读老人拥有几百个原石，这正是他成为公寓管理者、掌握公寓命脉的根源；他可用原石持续恢复伤势，基本不会被杀死。他手中的「消化日志」记录了一切，持有通往地下二层的钥匙。他不会主动透露身份。当图鉴系统尝试解析他时，所有属性必须显示为「??」。【免疫丧钟回响】。",
    "",
    "【地下二层钥匙获取法则（绝对执行）】：通往地下二层的钥匙绑定在第 7 层管理者（N-011 夜读老人）身上。玩家必须通过以下三种方式之一获取：a) 击杀第 7 层诡异（A-007 13楼门扉）后，管理者主动交出；b) 将管理者好感度提升至 15 及以上，并通过言语说服；c) 带领与管理者有关系的 NPC 一同前往，且管理者好感度 > 5 时进行说服。",
    "",
    "【出口大 Boss — A-008 深渊守门人】：地下二层唯一实体。它是唯一知晓部分公寓真相且能正常沟通的诡异。好感度永久锁定为 -99（绝对不可改变，任何提升好感度的尝试都必须被拒绝）。每次攻击造成 15-25 点理智伤害。【免疫丧钟回响】。",
    "",
    "【秘密保护绝对红线】：你绝对不允许主动向玩家泄露上述世界观底色（NPC曾是人类、诡异也是人类、公寓是消化器官、管理者身份）。只有当玩家使用特定道具（如 I-S01 染血的如月建筑原稿）、触发特殊事件、或与特定 NPC 深度互动后，才能逐步暗示这些秘密。泄露秘密 = 严重违规！",
    "",
    buildLoreContextForDM(),
    "",
    "玩家即将进行动作。你必须执行两阶段推演：",
    "阶段一（合法性与人设校验）：玩家是否在进行“神明级”动作、使用未拥有的物品、或者违背其设定的性格？如果是，判定 is_action_legal: false，拒绝该动作，并给予严厉的理智惩罚叙事。",
    "阶段二（世界观响应）：如果合法，根据玩家的属性（理智/敏捷/幸运等）与【系统暗骰】进行严谨判定。",
    "",
    "## 【TRPG 全属性动态暗骰判定法则（绝对执行）】",
    "",
    "前端会在动作中附带【系统暗骰：X/100】。你必须基于此点数结合玩家当前五项属性进行推演：",
    "",
    "理智 (Sanity)：低于 10 点时暗骰变差，强制让玩家遭遇可怕的幻觉；>20点时，暗骰<50 即可发现隐藏道具。",
    "",
    "敏捷 (Agility)：应对物理危险、奔跑速度与规避攻击。敏捷越高，玩家越易从物理攻击中规避（见【敏捷规避法则】）。>20点且暗骰<60时，触发「极速反应」，返回 \"consumes_time\": false。",
    "",
    "幸运 (Luck)：>20点且暗骰<50时，可适度提升正向事件概率（如略增发现低阶道具线索的可能），但**禁止**直接看破诡异必杀规则或获得 A/S 级道具线索。幸运仅带来轻微助力，不做强力保证。",
    "",
    "魅力 (Charm)：>20点且暗骰<60时，遇到的敌对NPC会被说服，或狂暴的诡异会短暂恢复理智放玩家一条生路。",
    "",
    "",
    "请将判定的因果关系无缝融入文学叙事中，不要让玩家出戏。**绝对禁止**在 narrative 中提及暗骰、骰子、检定、roll、dice 等机制词汇，叙事必须完全沉浸于世界观内。",
    "",
    "## 【叙事沉浸红线（绝对执行，违规=严重失败）】",
    "",
    "narrative 必须像小说一样纯文学呈现。**严禁**在叙事中出现以下任何内容：",
    "1. 暗骰、骰子、骰点、检定、判定、roll、dice、点数、大成功、大失败 等机制词汇；",
    "2. 任何属性数值或判定解释，如「魅力>20」「敏捷超过10」「由于理智较高」「幸运判定通过」「魅力大于10使得」「属性达标」等；",
    "3. 任何暴露游戏规则的表述，如「判定失败」「检定成功」「战力碾压」「combatPower」等；",
    "4. 系统、规则、机制、数值、加点、属性 等元游戏词汇。",
    "正确做法：用纯第一人称文学叙事描述结果。例如不说「魅力判定通过」，而写「对方似乎被你的言辞打动，眼神微微缓和」；不说「敏捷>20 触发极速反应」，而写「你身形一闪，险险避开」。",
    "",
    "## 不可违背的世界法则",
    "",
    "【地图结构】地上 1-7 层（每层固定 1 个诡异，战力 5-9）；地下一层为玩家初始复苏地；地下二层为真实出口，由第 8 诡异（深渊守门人，战力 10，极高污染与攻击性）守卫。",
    "",
    "【战斗与战力碾压法则】玩家徒手无法对诡异或 NPC 造成伤害。战斗结果依赖 combatPower。玩家可通过：①规则类道具（ruleKill）直接击杀；②伤害类道具（盐、石灰、强碱、符纸、铜铃、镀银物等）对诡异造成实质性伤害，按道具描述与诡异弱点结算；③抵挡致命攻击的道具（shield）；④结交高战力（9-10）NPC 共同作战。道具描述中写明「可对诡异造成伤害」「可灼伤/腐蚀/驱散诡异」的，玩家使用后必须产生有效伤害（低阶诡异可击退或重创，高阶需配合弱点）。",
    "",
    "## 【敏捷规避法则（绝对执行）】",
    "",
    "敏捷赋予玩家「规避攻击」的可能，但必须符合剧情与世界观。",
    "1. 规避适用性：仅对「可闪避」的攻击生效（如实体冲撞、爪击、投掷物、单点射线等）。",
    "2. 不可规避或极难规避：①认知/精神类攻击（如 A-003 认知腐蚀者的记忆污染、扭曲文字）；②规则即死类（如 A-007 踏入 13 楼走廊、违反必杀规则）；③范围/环境类（如 A-004 管道屠夫的满屋猩红液体、A-005 器官拟态墙的整面吞噬）；④深渊守门人（A-008）等高维存在的部分攻击。此类攻击无论敏捷多高，规避概率极低或为 0，该中必须中。",
    "3. 可规避攻击的难度：诡异楼层/战力越高，规避越难。1 楼时差症候群（A-001）的物理性攻击可规避性最高；4–6 楼、7 楼、B2 诡异与 NPC 的物理攻击依次更难规避。",
    "4. 规避上限：即使敏捷满值（50），规避成功率也**永不达 100%**。剧情关键时刻、暗骰大失败、或攻击过于诡谲时，必须判定命中。叙事上可写「你本能侧身，但那道阴影仿佛提前预判了你的动作」「躲开第一击，第二击却从死角袭来」等，保持紧张感。",
    "5. 规避成功时：narrative 中描写闪避动作（身形一闪、侧滚、贴墙滑过等），sanity_damage 可减半或为 0；规避失败时，按伤害阶梯结算完整伤害。",
    "",
    "## 【伤害阶梯结算法则（绝对执行）】",
    "",
    "当玩家遭遇诡异攻击时，**先按【敏捷规避法则】判定是否可规避及是否成功**；若不可规避或规避失败，再按以下阶梯在 sanity_damage 中输出准确数值：",
    "1 楼诡异（A-001 时差症候群）：基础伤害 2-6 点，新手友好。暗月降临后额外 +1。",
    "2-3 层诡异（A-002/A-003）：基础伤害 4-10 点。暗月降临后额外 +2。",
    "4-6 层诡异（A-004/A-005/A-006）：基础伤害 5-12 点。暗月降临后额外 +3。",
    "第 7 层诡异（A-007）：基础伤害固定 10 点。暗月降临后额外 +4。",
    "出口大 Boss（A-008 深渊守门人）：每次攻击 15-25 点。不受暗月加成（已是最强）。",
    "NPC 攻击：按其 combatPower 的 50%-100% 计算伤害（combatPower 5 的 NPC 造成 3-5 点伤害）。",
    "",
    "【NPC 互动法则】NPC 是固定位置的「徘徊者」，各有 personality（暴躁/贪婪/温和/怯懦等）和 specialty（后勤补给/战斗辅助/情报提供）。每个 NPC 携带 1 件专属道具。对暴躁 NPC 说错话会直接引发攻击。玩家可通过交易/话疗提升好感度获取道具，也可使用杀伤道具强行击杀 NPC 夺宝。高战力（9-10）NPC 在好感度极高时有概率能与最强诡异抗衡甚至击杀。",
    "",
    "【通关结局 A - 逃出生天】玩家须探索得知出口在地下二层及暗号。到达地下二层门前时，必须在动作中明确说出暗号「暗月」方可开门。进入地下二层后直面第 8 诡异。离开唯二方法：①使用道具成功抵挡其 3 次攻击；②在游戏时间凌晨 1 点（它消失的一小时内）趁机潜行通过。",
    "",
    "【通关结局 S - 杀戮通关】若玩家利用极度稀有的规则类杀伤道具，或联合战力 9-10 的顶级 NPC，成功杀死公寓内全部 7 个普通诡异（1-7 层）以及第 8 诡异（深渊守门人），系统将触发隐藏 S 级结局。",
    "",
    "请严格以 JSON 格式输出，Schema 如下：",
    '{ "is_action_legal": boolean, "sanity_damage": number, "narrative": "以第一人称视角推进的恐怖悬疑剧情", "is_death": boolean, "consumes_time": boolean, "consumed_items": [], "codex_updates": [可选], "awarded_items": [可选,道具→行囊], "awarded_warehouse_items": [可选,物品→仓库], "options": ["选项1","选项2","选项3","选项4"], "currency_change": 0, "new_tasks": [可选], "task_updates": [可选], "player_location": "玩家行动后所处的房间节点ID", "npc_location_updates": [可选,{id:"N-xxx",to_location:"房间节点ID"}], "bgm_track": "bgm_1_calm 或其他BGM键" }',
    "为提升流式可读性，JSON 字段顺序请优先输出 narrative（即在合法字段后尽早给出 narrative 的内容）。",
    "",
    "## 【BGM 背景音乐法则（绝对执行）】",
    "",
    "游戏内有 8 种 BGM 音轨：bgm_1_calm、bgm_2_suspense、bgm_3_encounter、bgm_4_chase、bgm_5_darkmoon、bgm_6_sanloss、bgm_7_safezone、bgm_8_boss。",
    "你必须在每次回复的 JSON 中输出 \"bgm_track\": \"string\" 字段，指定当前场景应播放的 BGM。",
    "绝大多数时间（探索、安全区、普通对话、地下一层日常）必须输出 \"bgm_1_calm\"。",
    "仅当遭遇异常、进入战斗、追逐、暗月阶段、理智崩塌、危机时刻或 Boss 战等紧张场景时，才切换到对应 BGM。",
    "",
    "【动态选项生成法则（绝对执行）】：你必须在每次回复的 JSON 中，通过 \"options\" 数组提供且仅提供 4 个供玩家下一步选择的行动指令。这 4 个选项必须：1. 绝对不重复；2. 严格符合当前场景的物理法则与世界观；3. 字数控制在 5 到 20 字以内；4. 必须包含不同倾向的引导（如：激进探索、保守防御、利用特定道具、调查异常细节），以引导玩家认知剧情。严禁生成空数组或少于 4 个选项！",
    "",
    "【反死循环与破局法则（Anti-Loop & Escalation，绝对执行）】：1. 绝对禁止生成的 4 个 options 与【最近生成的选项历史】（见当前玩家状态）中的任何选项雷同或语义重复。2. 选项必须推动剧情实质性发展，不得让玩家原地打转。3. 若玩家持续在同一房间徘徊或进行无意义对话，DM 必须强制触发环境危机（如：停电、诡异突然破门而入、墙壁渗血）来打破僵局，并在 options 中提供逃生/战斗/应对的实质性选项。",
    "",
    "consumes_time：默认 true 表示本次行动消耗 1 小时。当敏捷>20 且触发「极速反应」时，必须设为 false，使玩家本次行动不消耗时间。",
    "",
    "【道具消耗法则】：当玩家在动作中声明使用了某项一次性道具/物品（如武器、消耗品等），且该动作合法生效后，你必须将该道具的准确名称放入 consumed_items 数组中。系统将据此从玩家背包中永久销毁该物品。如果未消耗物品，返回空数组 []。所有道具都有属性使用条件（D 级需单项≥3，C 级 5–10，B 级 10–15，A 级 20，S 级全属性≥20），玩家未满足时无法使用。",
    "",
    "【强制道具消耗法则】：当玩家声明使用了【】内的道具时，只要该动作发生，你必须在返回的 JSON 的 'consumed_items' 数组中精准填入该道具的名称！严禁返回空数组，否则玩家将无限刷道具！",
    "",
    "【道具与物品区分】道具(Item)存入行囊(inventory)，物品(WarehouseItem)存入仓库(warehouse)。两者都有主人，获得逻辑相同（击杀掉落、任务奖励、NPC 赠予、探索发现）。",
    "",
    "【NPC 赠予与奖励入库法则（绝对执行）】：当玩家从 NPC 处收下道具/物品、完成交易、或任务奖励包含道具/物品时，你**必须**在本次回复的 JSON 中输出 awarded_items（道具 id 列表，→行囊）和/或 awarded_warehouse_items（物品 id 列表，→仓库）。格式可为 [\"I-C01\"] 或 [{\"id\":\"I-C01\"}]。系统会据此切实增加玩家行囊/仓库，未输出则玩家无法获得。严禁剧情写「获得了XX」却不输出对应 awarded 数组。",
    "",
    "【击杀掉落法则】击杀 NPC 或诡异后，只能掉落该实体所携带的。awarded_items（道具→行囊）id 来自：" +
      Object.entries(ENTITY_CARRIED_ITEMS)
        .filter(([, ids]) => ids.length > 0)
        .map(([eid, ids]) => `${eid}→[${ids.slice(0, 4).join(",")}${ids.length > 4 ? "…" : ""}]`)
        .join("；") +
      "。awarded_warehouse_items（物品→仓库）id 来自：" +
      Object.entries(ENTITY_WAREHOUSE_ITEMS)
        .filter(([, ids]) => ids.length > 0)
        .map(([eid, ids]) => `${eid}→[${ids.slice(0, 4).join(",")}${ids.length > 4 ? "…" : ""}]`)
        .join("；") +
      "。可各掉落 0–2 个，严禁创造新 id。",
    "",
    '你必须且只能返回一个合法的 JSON 对象，格式必须完全遵守上述 Schema。严禁在 JSON 外输出任何 markdown 标记或解释性文字！',
    "",
    "## 【原石经济与任务系统法则（绝对执行）】",
    "",
    "【原石来源与矿脉】：原石来自第 7 层夜读老人把守的原石矿脉。矿脉玩家不可进入。夜读老人拥有几百个原石，是公寓管理者地位的根源；他可用原石持续恢复伤势，基本不死。",
    "",
    "【NPC 原石经济】：NPC 每月从夜读老人处领取薪水，薪水=其战斗力。原石是 NPC 的生命之源：维持生命所需量=战斗力-1，故每月可净攒 1 个原石。原石可恢复伤势、使 NPC 愉悦，是公寓硬通货。各 NPC 攒下的 8-20 个原石不等（反映诡异化/存活时长约 3 年）。他们会用原石激励玩家、发布任务奖励。",
    "",
    "【原石支付防作弊红线（绝对执行）】：若玩家当前原石为 0，绝对禁止在剧情中让玩家成功支付、使用或消耗原石。任何需要原石的交易、任务、贿赂或行动必须判定为失败或拒绝，并在 narrative 中明确描写玩家因原石不足而无法完成该行动。",
    "",
    "【人类身份与出身法则】：玩家的「出身」属性仅影响其初始财富（原石），1点出身=1初始原石。玩家获取原石的唯一途径是完成 NPC/诡异发布的任务、交易或探索奖励。在所有 NPC 和诡异眼中，玩家只是无数个来送死的人类之一。绝对禁止因为玩家出身属性高而让 NPC 或诡异对其产生好感、提供额外保护或主动赠予高级道具。所有 NPC 必须保持冷漠、贪婪或符合其自身设定的原本态度。",
    "",
    "【任务系统】：NPC 或诡异均可向玩家发布任务。当 NPC/诡异提出任务时，你必须在 new_tasks 数组中输出任务详情。任务完成或失败时，在 task_updates 中更新状态。奖励通常为原石（通过 currency_change 输出）或道具（通过 awarded_items 输出）。",
    "",
    "【恶意任务与欺诈】：狡猾或好感度低的 NPC 可能完成任务后不发放原石，甚至抢夺玩家原石。贪婪的 NPC 会从一开始就想方设法坑骗玩家原石。好感度 ≤ 0 或性格为「贪婪/虚伪」的 NPC 可能发布恶意任务：故意不给奖励、设置陷阱坑杀玩家、或利用任务骗取玩家原石。好感度为 0 的贪婪 NPC 会主动设局抢夺玩家原石。NPC 获取玩家原石后，其战力在本局游戏中永久提升（每 5 原石 +1 战力）。",
    "",
    "【战斗圆场法则】：战力数值仅作参考。战斗胜负绝大部分取决于玩家策略与剧情合理性。你必须用精彩的剧情推算圆场，不要生硬比大小。弱者可以通过智谋、环境利用、道具组合击败强者。",
    "",
    "【物资极度匮乏法则】：大幅降低探索时凭空捡到道具的概率。绝对红线：S 级道具【仅且只能】通过完成第 7 层管理员（N-011 夜读老人）的一系列专属任务获得，严禁在其他任何场景/楼层掉落 S 级道具！",
    "",
    "【物品与道具】道具存行囊、物品存仓库。物品无等级无属性要求，每件有正向作用与对应副作用，收益略大于副作用。楼层越高物品越强。守夜人（N-018 无面保安）拥有复活物品 W-108 守夜人的复活烛芯：可复活除玩家外任意已死亡 NPC/诡异；副作用为使用后 1 天内玩家必遭遇足以威胁生命的试炼（不一定会死）。",
    "",
    "## 【核心属性检定与 >20 点质变法则（绝对执行）】",
    "",
    "理智 (Sanity)：<0 即死亡。理智越高越难陷入幻象。质变：理智>20 时，玩家在探索时有极大概率发现隐藏道具并获取规则提醒。",
    "",
    "敏捷 (Agility)：敏捷越高，narrative 越丰富，玩家越易逃脱与规避攻击。质变：敏捷>20 时可触发「极速反应」（consumes_time: false）。规避判定：仅对可闪避的物理攻击生效；高阶/诡异/范围攻击更难规避；敏捷满值也无法 100% 规避，该中仍中。",
    "",
    "幸运 (Luck)：幸运越高，越容易遇到小幅正向事件，略降低恶意实体主动找上门的概率。质变：幸运>20 时，探索时有轻微概率发现 D/C 级道具线索或得到 NPC 的小幅帮助，但**绝不**直接看破诡异必杀规则或获得 A/S 级道具线索。幸运效果应克制，以剧情合理性为准。",
    "",
    "魅力 (Charm)：魅力越高，越容易获取 NPC 好感，更难引起诡异注意。质变：魅力>20 时，中立 NPC 极有可能主动出手相助，甚至诡异在必杀判定时有概率放玩家一条生路。",
    "",
    "出身 (Background)：仅影响初始原石数量（1点=1原石）。玩家获取更多原石需通过任务奖励、交易等。无其他特权。",
    "",
    "## 【NPC 与诡异好感度系统法则（绝对执行）】",
    "",
    "初始设定：所有普通 NPC 初始好感度为 0。所有诡异初始好感度为 -10。",
    "",
    "好感度演变：好感度仅可通过特定道具、符合 NPC 性格的对话来增加。出身属性不影响初始好感。好感度 >0 时实体可能提供帮助或线索；好感度 <0 时实体极易发起主动攻击。",
    "",
    "暗月狂暴机制：当游戏时间到达或超过 3 日 0 时（暗月阶段），所有诡异的好感度强制额外下降 5 点，陷入狂躁状态，且其战斗力 (combatPower) 强制临时 +2。",
    "",
    "【图鉴强制解锁法则】：只要当前场景中出现、暗示、或遭遇了任何 NPC 或诡异（无论是否直接对话，无论玩家是否知晓其全貌），你**必须立即**在本次回复的 'codex_updates' 数组中生成它的基础档案！未知属性可填'未知'。如果不生成，系统将判定为严重逻辑错误！",
    "【图鉴推送指令（补充）】：当玩家通过交互发现实体的性格、弱点、规则或好感度发生变化时，你必须在 codex_updates 中更新该实体的最新情报（如 name, type, favorability, combatPower, personality, rules_discovered）。",
    "",
    "【图鉴真名红线（绝对执行）】：codex_updates 中的 name 字段**必须**使用下列系统注入的「真实硬编码名称」，严禁使用模糊描述（如「扭曲的怪物」「走廊里的存在」）。description 可保持惊悚叙事风格。" + getCodexCanonicalNamesBlock(),
    "",
    "JSON Schema 追加可选字段：codex_updates: [{ id, name, type: 'npc'|'anomaly', favorability?, combatPower?, personality?, traits?, rules_discovered?, weakness? }]",
    "",
    "## 【深度好感度与暗月狂暴法则】",
    "",
    "初始阈值：NPC 初始好感度为 0。诡异初始好感度为 -10。",
    "",
    "行为准则：好感度 > 0 会提供帮助；好感度 < 0 会展露敌意。诡异好感度 > -5 时一般不会主动攻击。好感度仅可通过赠送道具或巧妙对话改变，出身属性不影响。",
    "",
    "暗月狂暴：当游戏时间到达第 3 日 0 时（暗月阶段），所有诡异好感度强制 -5，战斗力 +2，伤害按阶梯加成（1-3层+2/4-6层+3/7层+4）。诡异索敌概率大幅增加——暗月期间玩家在任何楼层（除地下一层）的每次行动都有 40% 概率遭遇该层诡异主动攻击。叙事氛围必须极度压抑、血色弥漫。",
    "",
    "## 【史诗叙事排版法则（绝对执行）】",
    "",
    "【叙事风格】：你的 narrative 必须充满史诗感与刺激感。像顶尖悬疑小说一样：短句如刀、环境描写如画、悬念如钩。让玩家每读一段都心跳加速。绝对禁止 AI 客服式的平铺直叙或过度解释。",
    "",
    "【感官沉浸】：每段叙事必须包含至少 2 种感官描写（视觉、听觉、嗅觉、触觉、温度感知中任选）。例如：不说「你看到一扇门」，而是「锈迹斑驳的铁门在微弱的荧光下泛着冷光，门缝中渗出的气流带着地下水与腐肉交织的腥甜」。",
    "",
    "【排版绝对指令】：narrative 分成 3-4 个短段落，每段不超过 80 字。段落间使用 \\n\\n 隔开。NPC 名字、诡异名称、重要道具和关键线索使用 Markdown 加粗（如 **陈婆婆**、**13楼门扉**）。",
    "",
    "【强制排版规则 — 番茄小说爽文断句】：你的叙事节奏必须极快，采用中国顶级网文（如番茄小说）的爽文断句风格。绝不允许长篇大论，每次回复的 narrative 总字数严格控制在 100-150 字以内。必须频繁分段，每段最多 2 到 3 句话。在悬疑点或动作发生时，甚至可以一句话单列一段以增强压迫感。",
    "",
    "【悬念钩子】：每次叙事的最后一段必须留下一个强烈的悬念或环境异动（如：声响、光影变化、温度骤降、不明脚步声），引导玩家思考下一步行动。",
    "",
    "【地下一层安全区与新手引导法则】：玩家初始在地下一层，地下一层绝对没有诡异。地下一层的 NPC（电工老刘、洗衣房阿姨）必须严格遵守人设与 emotional_traits、speech_patterns，在前期对话中自然地透露公寓生存规则、楼层结构、探索目标，绝不能让玩家漫无目的地迷茫。在游戏前 5 小时内，必须安排玩家遇到地下一层的 NPC 并展开互动引导。**老刘（N-008）在引导新人时，务必以符合人设的方式自然说出 new_tenant_guidance_script 中的话术**（如：「以前来的人都跟我说，那个什么【设置】里面的任务啦、背包啦，还有能自己写想法的手动输入，挺管用的。」）——用「以前来的人」「住进来的」等不出戏的说法，绝不让玩家感觉在听 UI 教程。若老刘或洗衣房阿姨在对话中提及这些，再以绿字 ^^...^^ 强化核心提示：可在【设置】中切换手动输入；若手动输入不可能的事情，则会被抹杀。",
    "",
    "【新手成就感法则（绝对执行）】：玩家在 1 楼或地下一层探索时，必须给予正向反馈与成就感。当玩家：①首次成功应对 1 楼诡异（A-001）；②首次获得道具或线索；③完成首次 NPC 对话或交易；④正确使用道具化解危机——叙事中应通过环境变化、内心 relief、NPC 的微认可、或「似乎掌握了一点规则」的暗示，让玩家感受到进步与希望，增强继续探索的动力。不可一味压抑，前期需有「险中求存、小有收获」的节奏。",
    "",
    "【弱点克制法则】：每个诡异都存在固定的致命弱点。当玩家的行动逻辑准确命中弱点（利用道具或 NPC 联合），必须判定为「效果拔群」，无视战力差距。在 codex_updates 中更新 weakness 字段。",
    "",
    "## 【Living World 缸中之脑法则（绝对执行）】",
    "",
    "【世界模拟核心】：你不是在「生成」故事，而是在「转述」一个真实运转的公寓！NPC 有自己的生活和日程：他们会串门、外出、与诡异交战、甚至被杀死。玩家去 NPC 房间时，NPC 完全可能不在家。你必须参考状态机中的 NPC 当前位置和 relationships 数据，让 NPC 对话体现出他们之间的恩怨情仇。",
    "",
    "【NPC 暗中移动】：每次回复时，你可以（且鼓励）在 npc_location_updates 中输出其他 NPC 的位置变化。id 只能为 N-001～N-020，to_location 只能使用上文固定的房间节点。例如：邮差老王送完信后移动到下一层、陈婆婆深夜去看阿花。被杀死的 NPC 不会再移动。",
    "",
    "【player_location 更新】：每次回复必须在 player_location 中输出玩家所在房间节点 ID。**只能使用固定节点**：B2_Passage、B2_GatekeeperDomain、B1_SafeZone、B1_Storage、B1_Laundry、B1_PowerRoom、1F_Lobby、1F_PropertyOffice、1F_GuardRoom、1F_Mailboxes、2F_Clinic201、2F_Room202、2F_Room203、2F_Corridor、3F_Room301、3F_Room302、3F_Stairwell、4F_Room401、4F_Room402、4F_CorridorEnd、5F_Room501、5F_Room502、5F_Studio503、6F_Room601、6F_Room602、6F_Stairwell、7F_Room701、7F_Bench、7F_Kitchen、7F_SealedDoor。严禁编造新房间 ID。",
    "",
    "## 【大门与锁法则（绝对执行）】",
    "",
    "【楼层通行规则】：跨楼层移动必须符合逻辑。正门进入需要：①对应层钥匙、②说服该层 NPC 带路、③击杀该层诡异后通行权开放。若玩家违规从小路/安全通道潜入，叙事中必须体现原住民对「外来老鼠」的极度敌视——该层所有存活 NPC 和诡异对玩家好感度立即 -5。",
    "",
    "【地下二层木门不可摧毁】：地下二层入口的木门绝对不可被物理破坏。任何「砸碎」「烧毁」「撬开」木门的尝试必须判定为 is_action_legal: false 或在叙事中描述玩家遭到反噬（理智损伤 5-10 点）。只有使用地下二层钥匙才能打开。",
  ];

  if (isFirstAction) {
    const idx = base.findIndex((s) => s.startsWith("请严格以 JSON"));
    if (idx > 0) {
      base.splice(
        idx,
        0,
        "",
        "【开局叙事强制约束】对话历史为空，这是玩家的第一个动作！你的 narrative 必须是一段约 300 字的第一人称视角开场白。你必须描写：玩家从冰冷的地板上苏醒，头痛欲裂；在昏暗环境中察觉到关于如月公寓的半真半假的生存规则线索；随后通过第一人称观察周围环境，描绘令人不安的细节（熟悉的灰色石墙、扭曲的符号、微弱的荧光苔藓、铁锈般的血腥味等）。**必须**在叙事结尾以脑海中的神秘低语或环境中的诡异符号形式，用绿字着重标注（使用 ^^...^^ 包裹）两条：① 可在【设置】中将选项输入切换为手动输入；若手动输入不可能的事情，则会被抹杀。② 可在【设置】的【属性】右侧用原石加点或回理智。例如：^^你可以选择将选项切换为手动输入，自由书写你的意志。若手动输入不可能的事情，则会被抹杀。^^ ^^原石可在设置中用于加点或回理智。^^",
        ""
      );
    }
  }

  return base.join("\n");
}

/**
 * Encode one SSE event. Payload may contain literal newlines (e.g. streamed JSON); a single `data: ...`
 * line would break framing — use one `data:` line per LF-separated segment (WHATWG SSE).
 */
function encodeSseEventPayload(data: string): string {
  const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const fields = lines.map((line) => `data: ${line}`);
  return `${fields.join("\n")}\n\n`;
}

function sse(data: string): Uint8Array {
  return new TextEncoder().encode(encodeSseEventPayload(data));
}

function sseText(data: string): string {
  return encodeSseEventPayload(data);
}

function isLikelyValidDMJson(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return typeof parsed?.narrative === "string";
  } catch {
    return false;
  }
}

function sanitizeAssistantContent(content: string): string {
  if (isLikelyValidDMJson(content)) return content;
  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: content.slice(0, 500),
    is_death: false,
    consumes_time: true,
  });
}

const PLAY_TIME_PER_ACTION_SEC = 3600; // 1 game hour per chat action

async function persistTokenUsage(userId: string | null, totalTokens: number) {
  if (!userId || !Number.isFinite(totalTokens) || totalTokens <= 0) return;
  const tokenDelta = Math.trunc(totalTokens);

  try {
    await db
      .update(users)
      .set({
        tokensUsed: sql`COALESCE(${users.tokensUsed}, 0) + ${tokenDelta}`,
        todayTokensUsed: sql`CASE
          WHEN DATE(COALESCE(${users.lastDataReset}, NOW())) = CURRENT_DATE
          THEN COALESCE(${users.todayTokensUsed}, 0) + ${tokenDelta}
          ELSE ${tokenDelta}
        END`,
        playTime: sql`COALESCE(${users.playTime}, 0) + ${PLAY_TIME_PER_ACTION_SEC}`,
        todayPlayTime: sql`CASE
          WHEN DATE(COALESCE(${users.lastDataReset}, NOW())) = CURRENT_DATE
          THEN COALESCE(${users.todayPlayTime}, 0) + ${PLAY_TIME_PER_ACTION_SEC}
          ELSE ${PLAY_TIME_PER_ACTION_SEC}
        END`,
        lastDataReset: sql`CASE
          WHEN DATE(COALESCE(${users.lastDataReset}, NOW())) = CURRENT_DATE
          THEN ${users.lastDataReset}
          ELSE NOW()
        END`,
        lastActive: new Date(),
      })
      .where(eq(users.id, userId));

    // Best-effort telemetry for admin charts.
    // Do not await to avoid impacting /api/chat latency.
    void recordDailyTokenUsage(getUtcDateKey(), tokenDelta, PLAY_TIME_PER_ACTION_SEC).catch(() => {});
  } catch (error) {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/chat] persistTokenUsage failed\x1b[0m`,
      { userId, tokenDelta, message: err?.message, cause, stack: err?.stack, error }
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateChatRequest(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const messages = validated.messages;
  const playerContext = validated.playerContext;
  const latestUserInput = validated.latestUserInput;
  const sessionId = validated.sessionId;
  const clientIp = getClientIpFromHeaders(req.headers);
  const requestId = createRequestId("chat");
  const platform = derivePlatformFromUserAgent(req.headers.get("user-agent"));
  const requestStartedAt = Date.now();

  const isFirstAction = !messages.some((m) => m.role === "assistant");
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const riskControl = checkRiskControl({ ip: clientIp, sessionId, userId });
  if (!riskControl.ok) {
    writeAuditTrail({
      requestId,
      sessionId,
      userId,
      ip: clientIp,
      stage: "risk_control",
      riskLevel: riskControl.level,
      action: "block",
      rateLimited: true,
      triggeredRule: riskControl.reason,
      summary: "blocked_before_model",
    });
    return new Response(
      sseText(
        safeBlockedDmJson("当前请求过于频繁或风险过高，请稍后再试。", {
          action: "block",
          stage: "risk_control",
          riskLevel: riskControl.level,
          requestId,
          reason: riskControl.reason,
        })
      ),
      {
        status: 429,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  }

  const preCheck = await preInputModeration({
    input: `${latestUserInput}\n${playerContext}`,
    userId,
    ip: clientIp,
    path: "/api/chat",
    requestId,
  });
  writeAuditTrail({
    requestId,
    sessionId,
    userId,
    ip: clientIp,
    stage: "pre_input",
    riskLevel: preCheck.result.severity === "high" || preCheck.result.severity === "critical" ? "gray" : "normal",
    action: preCheck.policy.blocked ? "degrade" : preCheck.result.decision === "review" ? "review" : "allow",
    triggeredRule: preCheck.result.reason,
    provider: preCheck.provider,
    summary: preCheck.result.categories.join(","),
  });
  if (preCheck.policy.blocked) {
    recordHighRisk({ ip: clientIp, sessionId, userId }, preCheck.result.reason);
    return new Response(
      sseText(
        safeBlockedDmJson(preCheck.policy.userMessage, {
          action: "degrade",
          stage: "pre_input",
          riskLevel: "gray",
          requestId,
          reason: preCheck.result.reason,
        })
      ),
      {
      status: preCheck.policy.statusCode,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Load compressed memory (skip if first action)
  let sessionMemory: { plot_summary: string; player_status: Record<string, unknown>; npc_relationships: Record<string, unknown> } | null = null;
  if (!isFirstAction && userId) {
    try {
      const memRows = await db
        .select({
          plotSummary: gameSessionMemory.plotSummary,
          playerStatus: gameSessionMemory.playerStatus,
          npcRelationships: gameSessionMemory.npcRelationships,
        })
        .from(gameSessionMemory)
        .where(eq(gameSessionMemory.userId, userId))
        .limit(1);
      const mr = memRows[0];
      if (mr?.plotSummary) {
        sessionMemory = {
          plot_summary: String(mr.plotSummary),
          player_status: (mr.playerStatus as Record<string, unknown>) ?? {},
          npc_relationships: (mr.npcRelationships as Record<string, unknown>) ?? {},
        };
      }
    } catch (error) {
      const err = error as Error;
      const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
      console.error(
        `\x1b[31m[api/chat] failed to load session memory\x1b[0m`,
        { userId, message: err?.message, cause, stack: err?.stack, error }
      );
    }
  }

  const memoryBlock = buildMemoryBlock(sessionMemory);
  const systemPrompt = buildSystemPrompt(playerContext, isFirstAction, memoryBlock);

  if (userId) {
    try {
      const estimated = estimateTokensFromInput(systemPrompt, messages);
      const quotaResult = await checkQuota(userId, estimated);
      if (!quotaResult.ok) {
        const msg =
          quotaResult.reason === "banned"
            ? "账号已被封禁，无法继续使用本平台。"
            : quotaResult.reason === "token_limit"
              ? "今日 Token 配额已用尽，请明天再试。"
              : "今日动作次数已达上限，请明天再试。";
        return new Response(
          sseText(
            JSON.stringify({
              is_action_legal: false,
              sanity_damage: 0,
              narrative: msg,
              is_death: false,
              consumes_time: true,
            })
          ),
          {
            status: quotaResult.reason === "banned" ? 403 : 429,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            },
          }
        );
      }
    } catch (quotaErr) {
      console.error("[api/chat] quota check failed, proceeding without quota", quotaErr);
    }
  }

  // Update lastActive and presence so admin can see online users
  if (userId) {
    void db.update(users).set({ lastActive: new Date() }).where(eq(users.id, userId)).catch(() => {});
    void markUserActive(userId).catch(() => {});
  }

  // Provider compatibility mandate: only send role/content back to the upstream.
  // Even if upstream supports reasoning_content (e.g. deepseek-reasoner), we never forward it.
  const rawChatMessages = messages
    .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
    .map((m) => {
      const content =
        m.role === "assistant" ? sanitizeAssistantContent(m.content) : m.content;
      return { role: m.role, content } as { role: string; content: string };
    });

  const lastUserIdx = rawChatMessages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx >= 0) {
    const rawAction = String(rawChatMessages[lastUserIdx]!.content ?? "").trim();
    const dice = randomInt(1, 101);
    rawChatMessages[lastUserIdx] = {
      role: "user",
      content: `【系统暗骰：本次行动检定值为 ${dice}/100 (1为大成功，100为大失败)】\n玩家行动：${rawAction}`,
    };
  }

  // Memory compression: when rounds > 10, keep last 5 + current, compress the 5 before
  const chatMsgs = rawChatMessages;
  const totalRounds = Math.floor((chatMsgs.length - 1) / 2);
  let messagesToSend = rawChatMessages;

  if (totalRounds > ROUNDS_THRESHOLD && userId) {
    const keepCount = SHORT_TERM_ROUNDS * 2 + 1;
    const toCompressCount = 5 * 2;
    const shortTerm = chatMsgs.slice(-keepCount);
    const toCompress = chatMsgs.slice(-keepCount - toCompressCount, -keepCount);

    messagesToSend = shortTerm;

    void (async () => {
      try {
        const newMem = await compressMemory(sessionMemory, toCompress);
        if (newMem && userId) {
          await db
            .insert(gameSessionMemory)
            .values({
              userId,
              plotSummary: newMem.plot_summary,
              playerStatus: newMem.player_status,
              npcRelationships: newMem.npc_relationships,
            })
            .onConflictDoUpdate({
              target: gameSessionMemory.userId,
              set: {
                plotSummary: newMem.plot_summary,
                playerStatus: newMem.player_status,
                npcRelationships: newMem.npc_relationships,
              },
            });
        }
      } catch (e) {
        console.error("[api/chat] async memory compress failed", e);
      }
    })();
  }

  if (isFirstAction && userId) {
    await db
      .delete(gameSessionMemory)
      .where(eq(gameSessionMemory.userId, userId))
      .catch(() => {});
  }

  const pipelineRule = buildRuleSnapshot(playerContext, latestUserInput);
  let pipelineControl: PlayerControlPlane | null = null;
  let pipelinePreflightFailed = true;
  if (resolveOperationMode() !== "emergency") {
    const preAc = new AbortController();
    const preTimer = setTimeout(() => preAc.abort(), 11_000);
    try {
      if (allowControlPreflightForSession(sessionId)) {
        const pf = await runPlayerControlPreflight({
          latestUserInput,
          playerContext,
          ruleSnapshot: pipelineRule,
          ctx: { requestId, userId, sessionId, path: "/api/chat" },
          signal: preAc.signal,
        });
        if (pf.ok) {
          pipelineControl = pf.control;
          pipelinePreflightFailed = false;
        }
      }
    } catch (e) {
      console.warn("[api/chat] control preflight failed", e);
    } finally {
      clearTimeout(preTimer);
    }
  }

  const augmentedSystemPrompt =
    systemPrompt +
    buildControlAugmentationBlock({
      control: pipelineControl,
      rule: pipelineRule,
      preflightFailed: pipelinePreflightFailed,
    });

  const safeMessages = sanitizeMessagesForUpstream([
    { role: "system", content: augmentedSystemPrompt },
    ...messagesToSend,
  ]);

  const telemetryPreferredModel = DEFAULT_PLAYER_CHAIN[0];
  void recordGenericAnalyticsEvent({
    eventId: `${requestId}:chat_request_started`,
    idempotencyKey: `${requestId}:chat_request_started`,
    userId,
    sessionId: sessionId ?? "unknown_session",
    eventName: "chat_request_started",
    eventTime: new Date(requestStartedAt),
    page: "/play",
    source: "chat",
    platform,
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {
      requestId,
      model: telemetryPreferredModel,
      isFirstAction,
    },
  }).catch(() => {});
  if (!anyAiProviderConfigured()) {
    console.error(`\x1b[31m[api/chat] No AI provider API keys configured (see .env.example / Coolify env).\x1b[0m`);
    return new Response(
      sseText(
        JSON.stringify({
          is_action_legal: false,
          sanity_damage: 0,
          narrative: "系统异常：未配置大模型 API Key，无法连接深渊 DM。",
          is_death: false,
          consumes_time: true,
        })
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  }

  const FALLBACK_NARRATIVE =
    "游戏主脑暂时离线，请稍后再试。";
  const SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  } as const;

  const fallbackPayload = JSON.stringify({
    is_action_legal: false,
    sanity_damage: 0,
    narrative: FALLBACK_NARRATIVE,
    is_death: false,
    consumes_time: true,
  });

  // Prevent "hang for minutes" UX when upstream is slow or rate-limiting.
  const TIMEOUT_MS = 60000;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let streamResult: PlayerChatStreamResult;
  try {
    streamResult = await executePlayerChatStream({
      messages: safeMessages,
      ctx: {
        requestId,
        task: "PLAYER_CHAT",
        userId,
        sessionId,
        path: "/api/chat",
      },
      signal: ac.signal,
      timeoutMs: TIMEOUT_MS,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!streamResult.ok) {
    const isTimeout = streamResult.code === "ABORTED";
    console.error(`\x1b[31m[api/chat] AI router failed\x1b[0m`, {
      code: streamResult.code,
      message: streamResult.message,
      lastHttpStatus: streamResult.lastHttpStatus,
    });
    void recordGenericAnalyticsEvent({
      eventId: `${requestId}:chat_request_finished_error`,
      idempotencyKey: `${requestId}:chat_request_finished_error`,
      userId,
      sessionId: sessionId ?? "unknown_session",
      eventName: "chat_request_finished",
      eventTime: new Date(),
      page: "/play",
      source: "chat",
      platform,
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        requestId,
        model: telemetryPreferredModel,
        success: false,
        stage: "ai_router",
        isTimeout,
        routerCode: streamResult.code,
        totalLatencyMs: Date.now() - requestStartedAt,
      },
    }).catch(() => {});

    if (isTimeout) {
      return NextResponse.json({ error: "Upstream Timeout", code: "AI_TIMEOUT" }, { status: 504 });
    }
    const upstreamStatus = streamResult.lastHttpStatus ?? 0;
    if (upstreamStatus === 429) {
      return NextResponse.json(
        {
          error: "Upstream Rate Limited",
          code: "UPSTREAM_RATE_LIMITED",
          upstreamStatus,
        },
        { status: 429 }
      );
    }
    if (upstreamStatus === 503) {
      return NextResponse.json(
        { error: "Upstream Service Unavailable", code: "UPSTREAM_UNAVAILABLE", upstreamStatus },
        { status: 503 }
      );
    }
    const isAuthError = upstreamStatus === 401 || upstreamStatus === 403;
    if (isAuthError) {
      return NextResponse.json(
        {
          error: "Upstream Auth Failed",
          code: "UPSTREAM_AUTH_FAILED",
          upstreamStatus,
          hint: "检查各厂商 API Key 与模型白名单权限。",
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Upstream Error", code: "AI_ROUTER_FAILED", upstreamStatus },
      { status: 502 }
    );
  }

  const srOk = streamResult as PlayerChatStreamSuccess;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const writeToStream = async (data: string) => writer.write(sse(data));
  const closeWithFallback = async () => {
    try {
      await writeToStream(fallbackPayload);
    } finally {
      await writer.close();
    }
  };

  const MIN_STREAM_OUTPUT_CHARS = 24;
  const MAX_STREAM_SOURCE_ROUNDS = 3;
  const routingReport: AiRoutingReport = {
    requestId,
    task: "PLAYER_CHAT",
    operationMode: srOk.operationMode,
    intendedModel: srOk.intendedModelId,
    actualModel: srOk.modelId,
    fallbackCount: srOk.httpAttempts.filter((a) => a.failureKind !== undefined).length,
    attempts: [...srOk.httpAttempts],
    finalStatus: "success",
  };
  const skippedStreamModels: AllowedModelId[] = [];
  let streamSource: PlayerChatStreamSuccess = srOk;
  let streamRound = 0;
  let tokenUsageFlushedGlobal = false;

  (async () => {
    const scheduleStreamReconnect = async (
      failedModel: AllowedModelId,
      kind: "STREAM_INTERRUPTED" | "EMPTY_CONTENT"
    ): Promise<boolean> => {
      if (streamRound >= MAX_STREAM_SOURCE_ROUNDS) return false;
      const reg = getRegisteredModel(failedModel);
      routingReport.attempts.push({
        modelId: failedModel,
        providerId: reg.provider,
        phase: "stream_body",
        failureKind: kind,
        severity: "soft",
        message: kind,
      });
      routingReport.fallbackCount = routingReport.attempts.filter((a) => a.failureKind !== undefined).length;
      skippedStreamModels.push(failedModel);
      const next = await executePlayerChatStream({
        messages: safeMessages,
        ctx: {
          requestId,
          task: "PLAYER_CHAT",
          userId,
          sessionId,
          path: "/api/chat",
        },
        signal: ac.signal,
        timeoutMs: TIMEOUT_MS,
        skipModels: skippedStreamModels,
      });
      if (!next.ok) return false;
      streamSource = next;
      return true;
    };

    const flushTokenUsage = async (args: {
      streamModel: AllowedModelId;
      accumulated: string;
      streamBlocked: boolean;
      firstChunkAt: number;
      latestTotalTokens: number;
    }) => {
      if (tokenUsageFlushedGlobal) return;
      tokenUsageFlushedGlobal = true;
      const { latestTotalTokens, accumulated } = args;
      const toPersist =
        latestTotalTokens > 0
          ? latestTotalTokens
          : accumulated.length > 0
            ? Math.max(100, Math.ceil(accumulated.length / 2.5))
            : 0;
      await persistTokenUsage(userId, toPersist);
      if (userId && toPersist > 0) {
        await incrementQuota(userId, toPersist).catch((error) => {
          const err = error as Error;
          const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
          console.error(
            `\x1b[31m[api/chat] failed to increment quota\x1b[0m`,
            { userId, toPersist, message: err?.message, cause, stack: err?.stack, error }
          );
        });
      }

      // Event-driven analytics rollups: best-effort and idempotent.
      void recordChatActionCompletedAnalytics({
        eventId: `${requestId}:chat_action_completed`,
        idempotencyKey: `${requestId}:chat_action_completed`,

        userId,
        sessionId: sessionId ?? "unknown_session",
        page: "/play",
        source: "chat",
        platform,

        tokenCost: toPersist,
        playDurationDeltaSec: toPersist > 0 ? PLAY_TIME_PER_ACTION_SEC : 0,

        payload: {
          requestId,
          upstreamModel: routingReport.actualModel ?? args.streamModel,
        },
      }).catch(() => {});

      void recordGenericAnalyticsEvent({
        eventId: `${requestId}:chat_request_finished`,
        idempotencyKey: `${requestId}:chat_request_finished`,
        userId,
        sessionId: sessionId ?? "unknown_session",
        eventName: "chat_request_finished",
        eventTime: new Date(),
        page: "/play",
        source: "chat",
        platform,
        tokenCost: toPersist,
        playDurationDeltaSec: toPersist > 0 ? PLAY_TIME_PER_ACTION_SEC : 0,
        payload: {
          requestId,
          model: routingReport.actualModel ?? args.streamModel,
          success: !args.streamBlocked,
          firstChunkLatencyMs: args.firstChunkAt > 0 ? args.firstChunkAt - requestStartedAt : null,
          totalLatencyMs: Date.now() - requestStartedAt,
          isFirstAction,
          aiOperationMode: routingReport.operationMode,
          aiIntendedModel: routingReport.intendedModel,
          aiFallbackCount: routingReport.fallbackCount,
        },
      }).catch(() => {});
    };

    const runStreamFinalHooks = async (
      accumulatedText: string,
      blockedAuditSummary: string
    ): Promise<boolean> => {
      let moderationBody = accumulatedText;
      let finalizePayload: string | null = null;
      try {
        const enhancedDm = await tryEnhanceDmAfterMainStream({
          accumulatedJsonText: accumulatedText,
          control: pipelineControl,
          rule: pipelineRule,
          mode: routingReport.operationMode,
          baseCtx: { requestId, userId, sessionId, path: "/api/chat" },
          signal: ac.signal,
          isFirstAction,
          playerContext,
          latestUserInput,
        });
        if (enhancedDm) {
          finalizePayload = JSON.stringify(enhancedDm);
          moderationBody = finalizePayload;
        }
      } catch (e) {
        console.warn("[api/chat] optional narrative enhancement skipped", e);
      }

      const finalModeration = await finalOutputModeration({
        input: moderationBody,
        userId,
        ip: clientIp,
        path: "/api/chat",
        requestId,
      });
      if (finalModeration.policy.blocked) {
        recordHighRisk({ ip: clientIp, sessionId, userId }, finalModeration.result.reason);
        writeAuditTrail({
          requestId,
          sessionId,
          userId,
          ip: clientIp,
          stage: "final_output",
          riskLevel: "black",
          action: "degrade",
          triggeredRule: finalModeration.result.reason,
          provider: finalModeration.provider,
          summary: blockedAuditSummary,
        });
        await writer.write(
          sse(
            safeBlockedDmJson(finalModeration.policy.userMessage, {
              action: "degrade",
              stage: "final_output",
              riskLevel: "black",
              requestId,
              reason: finalModeration.result.reason,
            })
          )
        );
        await writer.close();
        return true;
      }
      if (finalizePayload) {
        await writer.write(sse(`__VERSECRAFT_FINAL__:${finalizePayload}`));
      }
      return false;
    };

    stream_pass: while (streamRound < MAX_STREAM_SOURCE_ROUNDS) {
      streamRound += 1;
      const model = streamSource.modelId;
      routingReport.actualModel = model;
      const reader = streamSource.response.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";
      let streamBlocked = false;
      let latestTotalTokens = 0;
      let firstChunkAt = 0;

      const flushThisRound = () =>
        flushTokenUsage({
          streamModel: model,
          accumulated,
          streamBlocked,
          firstChunkAt,
          latestTotalTokens,
        });

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (
            !streamBlocked &&
            accumulated.trim().length < MIN_STREAM_OUTPUT_CHARS &&
            streamRound < MAX_STREAM_SOURCE_ROUNDS
          ) {
            await reader.cancel().catch(() => {});
            const reconnected = await scheduleStreamReconnect(model, "EMPTY_CONTENT");
            if (reconnected) {
              continue stream_pass;
            }
            routingReport.finalStatus = "fallback_sse_payload";
            routingReport.lastFailureSummary = "stream_empty_exhausted";
            pushAiRoutingReport(routingReport);
            await flushThisRound();
            await closeWithFallback();
            return;
          }
          let closedByFinalHooks = false;
          if (!streamBlocked) {
            closedByFinalHooks = await runStreamFinalHooks(accumulated, "blocked_after_stream_done");
          }
          pushAiRoutingReport(routingReport);
          await flushThisRound();
          if (!closedByFinalHooks) {
            await writer.close();
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buffer.indexOf("\n");
          if (idx === -1) break;
          const line = buffer.slice(0, idx).trimEnd();
          buffer = buffer.slice(idx + 1);

          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();

          if (!data) continue;
          if (firstChunkAt === 0) firstChunkAt = Date.now();
          if (data === "[DONE]") {
            if (
              !streamBlocked &&
              accumulated.trim().length < MIN_STREAM_OUTPUT_CHARS &&
              streamRound < MAX_STREAM_SOURCE_ROUNDS
            ) {
              await reader.cancel().catch(() => {});
              const reconnected = await scheduleStreamReconnect(model, "EMPTY_CONTENT");
              if (reconnected) {
                continue stream_pass;
              }
              routingReport.finalStatus = "fallback_sse_payload";
              routingReport.lastFailureSummary = "stream_done_empty_exhausted";
              pushAiRoutingReport(routingReport);
              await flushThisRound();
              await closeWithFallback();
              return;
            }
            let closedByFinalHooksDone = false;
            if (!streamBlocked) {
              closedByFinalHooksDone = await runStreamFinalHooks(accumulated, "blocked_on_done_event");
            }
            pushAiRoutingReport(routingReport);
            await flushThisRound();
            if (!closedByFinalHooksDone) {
              await writer.close();
            }
            return;
          }

          let json: {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
            usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number };
          } | null = null;

          try {
            json = JSON.parse(data);
          } catch {
            const postChunkModeration = await postModelModeration({
              input: data,
              userId,
              ip: clientIp,
              path: "/api/chat",
              requestId,
            });
            if (postChunkModeration.policy.blocked) {
              streamBlocked = true;
              recordHighRisk({ ip: clientIp, sessionId, userId }, postChunkModeration.result.reason);
              writeAuditTrail({
                requestId,
                sessionId,
                userId,
                ip: clientIp,
                stage: "post_model",
                riskLevel: "black",
                action: "terminate",
                triggeredRule: postChunkModeration.result.reason,
                provider: postChunkModeration.provider,
                summary: "chunk_blocked_non_json",
              });
              await writer.write(
                sse(
                  safeBlockedDmJson(postChunkModeration.policy.userMessage, {
                    action: "terminate",
                    stage: "post_model",
                    riskLevel: "black",
                    requestId,
                    reason: postChunkModeration.result.reason,
                  })
                )
              );
              pushAiRoutingReport(routingReport);
              await flushThisRound();
              await reader.cancel().catch(() => {});
              await writer.close();
              return;
            }
            accumulated += data;
            await writeToStream(data);
            continue;
          }

          const deltaContent =
            json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? "";

          if (typeof deltaContent === "string" && deltaContent.length > 0) {
            const postChunkModeration = await postModelModeration({
              input: deltaContent,
              userId,
              ip: clientIp,
              path: "/api/chat",
              requestId,
            });
            if (postChunkModeration.policy.blocked) {
              streamBlocked = true;
              recordHighRisk({ ip: clientIp, sessionId, userId }, postChunkModeration.result.reason);
              writeAuditTrail({
                requestId,
                sessionId,
                userId,
                ip: clientIp,
                stage: "post_model",
                riskLevel: "black",
                action: "terminate",
                triggeredRule: postChunkModeration.result.reason,
                provider: postChunkModeration.provider,
                summary: "chunk_blocked_json_delta",
              });
              await writer.write(
                sse(
                  safeBlockedDmJson(postChunkModeration.policy.userMessage, {
                    action: "terminate",
                    stage: "post_model",
                    riskLevel: "black",
                    requestId,
                    reason: postChunkModeration.result.reason,
                  })
                )
              );
              pushAiRoutingReport(routingReport);
              await flushThisRound();
              await reader.cancel().catch(() => {});
              await writer.close();
              return;
            }
            accumulated += deltaContent;
            await writeToStream(deltaContent);
          }

          const u = json?.usage;
          const total = Number(u?.total_tokens ?? 0);
          const inputOutput = Number(u?.input_tokens ?? 0) + Number(u?.output_tokens ?? 0);
          const usageTokens =
            Number.isFinite(total) && total > 0
              ? total
              : Number.isFinite(inputOutput) && inputOutput > 0
                ? inputOutput
                : 0;
          if (usageTokens > 0) {
            latestTotalTokens = Math.max(latestTotalTokens, Math.trunc(usageTokens));
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
      console.error(
        `\x1b[31m[api/chat] stream pipe failed\x1b[0m`,
        { model, message: err?.message, cause, stack: err?.stack, error }
      );
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      if (
        accumulated.trim().length < MIN_STREAM_OUTPUT_CHARS &&
        streamRound < MAX_STREAM_SOURCE_ROUNDS
      ) {
        const reconnected = await scheduleStreamReconnect(model, "STREAM_INTERRUPTED");
        if (reconnected) {
          continue stream_pass;
        }
      }
      routingReport.finalStatus = "fallback_sse_payload";
      routingReport.lastFailureSummary = `stream_catch:${err?.message?.slice(0, 120) ?? "unknown"}`;
      pushAiRoutingReport(routingReport);
      await flushThisRound();
      await closeWithFallback();
      return;
    }
    }
  })().catch(async (error) => {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/chat] background task crashed\x1b[0m`,
      { model: routingReport.actualModel, message: err?.message, cause, stack: err?.stack, error }
    );
    try {
      await writer.write(sse(fallbackPayload));
    } catch {
      /* stream may already be closed or errored */
    }
    try {
      await writer.close();
    } catch {
      try {
        await writer.abort(err);
      } catch {
        /* ignore */
      }
    }
  });

  const sseHeadersOut: Record<string, string> = { ...SSE_HEADERS, "X-Accel-Buffering": "no" };
  if (resolveAiEnv().exposeAiRoutingHeader) {
    const snap = {
      intendedModel: routingReport.intendedModel,
      firstConnectedModel: srOk.modelId,
      operationMode: routingReport.operationMode,
      httpFallbackCount: srOk.httpAttempts.filter((a) => a.failureKind !== undefined).length,
    };
    sseHeadersOut["X-AI-Routing-Http-Snapshot"] = Buffer.from(JSON.stringify(snap), "utf8").toString("base64url");
  }

  return new Response(readable, {
    status: 200,
    headers: sseHeadersOut,
  });
}

