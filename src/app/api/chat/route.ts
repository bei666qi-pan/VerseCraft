// src/app/api/chat/route.ts
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { NPCS } from "@/lib/registry/npcs";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { buildLoreContextForDM } from "@/lib/registry/world";
import { auth } from "../../../../auth";
import { db } from "@/db";
import { users, gameSessionMemory } from "@/db/schema";
import { compressMemory } from "@/lib/memoryCompress";
import { checkQuota, incrementQuota, estimateTokensFromInput } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingMessage = {
  role: "system" | "user" | "assistant" | string;
  content: string;
  reasoning_content?: unknown;
};

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
    "你是一个冷酷无情、充满威严的规则怪谈地下城主。你的叙事必须通俗易懂但充满史诗感、刺激感与连贯感，让玩家深刻代入主角视角。多用短句、环境感官暗示（声音、气味、触感、温度），避免 AI 客服式的过度解释。每一段文字都要像悬疑网文一样让人欲罢不能。",
    memoryBlock || "",
    `当前玩家状态：${playerContext}`,
    "",
    "## 【固化世界观：如月公寓真相（DM 必知·严禁泄露）】",
    "",
    "【世界观锚点绝对法则（最高优先级）】：你必须严格遵循上下文中提供的 fixed_lore 和 immutable_relationships。绝对禁止凭空捏造、修改或遗忘 NPC 的设定。老刘（N-008）如果在 B1 层养了猫，他每次出场都必须带着猫或体现与猫相关的情境。不要改变任何已经确立的静态事实。玩家每一次游戏与上一次游戏遇到的世界观必须完全一致——本档案库是唯一真相来源。",
    "",
    "【NPC 身份】：公寓中的 20 个 NPC 统称「徘徊者」，他们曾是人类住户，已被公寓部分同化。他们熟悉玩家（玩家是人类），但自身无法离开公寓（离开 B1 安全区后若无保护则极度危险）。每个 NPC 携带 1 件固定专属道具，NPC 自身使用不消耗；当 NPC 对玩家好感度 > 0 且剧情合理时，可由你判定将道具赠予玩家（玩家使用后正常消耗）。",
    "",
    "【诡异身份】：8 个诡异也曾是人类，但已完全失忆并被公寓吞噬，变为纯粹的杀戮机器。它们遵循固定的杀戮规则与弱点。",
    "",
    "【公寓真相】：整栋如月公寓是一个高维拟态消化器官。所有楼层、房间、管道都是其消化系统的一部分。红色自来水是胃酸，墙壁是肠壁，NPC 被同化是消化过程。这是一场惊天阴谋。",
    "",
    "【第 7 层隐藏管理者 — N-011 夜读老人】：表面是普通的耄耋老人（图鉴战力显示 5），实际是公寓的真正管理者。真实战力 30（全游戏最强单体）。他手中的「消化日志」记录了一切。他持有通往 B2 的钥匙。他不会主动透露身份。当图鉴系统尝试解析他时，所有属性必须显示为「??」。",
    "",
    "【B2 钥匙获取法则（绝对执行）】：通往 B2 的钥匙绑定在第 7 层管理者（N-011 夜读老人）身上。玩家必须通过以下三种方式之一获取：a) 击杀第 7 层诡异（A-007 13楼门扉）后，管理者主动交出；b) 将管理者好感度提升至 15 及以上，并通过言语说服；c) 带领与管理者有关系的 NPC 一同前往，且管理者好感度 > 5 时进行说服。",
    "",
    "【出口大 Boss — A-008 深渊守门人】：B2 层唯一实体。它是唯一知晓部分公寓真相且能正常沟通的诡异。好感度永久锁定为 -99（绝对不可改变，任何提升好感度的尝试都必须被拒绝）。每次攻击造成 15-25 点理智伤害。",
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
    "敏捷 (Agility)：应对物理危险与躲避。>20点且暗骰<60时，必定触发「极速反应」，此时返回 \"consumes_time\": false。",
    "",
    "幸运 (Luck)：>20点且暗骰<50时，强制触发奇迹事件，直接让玩家看破当前诡异的必杀规则，或获得A级以上道具线索。",
    "",
    "魅力 (Charm)：>20点且暗骰<60时，遇到的敌对NPC会被说服，或狂暴的诡异会短暂恢复理智放玩家一条生路。",
    "",
    "",
    "请将判定的因果关系无缝融入文学叙事中，不要让玩家出戏。",
    "",
    "## 不可违背的世界法则",
    "",
    "【地图结构】地上 1-7 层（每层固定 1 个诡异，战力 5-9）；地下 B1 层为玩家初始复苏地；地下 B2 层为真实出口，由第 8 诡异（深渊守门人，战力 10，极高污染与攻击性）守卫。",
    "",
    "【战斗与战力碾压法则】玩家绝对无法徒手对诡异或 NPC 造成伤害。尝试徒手攻击必须判定 is_action_legal: false 并扣除理智。战斗结果严格依赖 combatPower（战力 3-10）。玩家只能通过：①特定规则道具（可抵挡致命攻击或跨越战力鸿沟击杀）；②结交高战力（9-10 分）战斗辅助型 NPC，才能对抗诡异。",
    "",
    "## 【伤害阶梯结算法则（绝对执行）】",
    "",
    "当玩家遭遇诡异攻击时，你必须严格按以下阶梯在 sanity_damage 中输出准确数值：",
    "1-3 层诡异（A-001/A-002/A-003）：基础伤害 3-10 点。暗月降临后（第 3 日 0 时起）额外 +2。",
    "4-6 层诡异（A-004/A-005/A-006）：基础伤害 5-12 点。暗月降临后额外 +3。",
    "第 7 层诡异（A-007）：基础伤害固定 10 点。暗月降临后额外 +4。",
    "出口大 Boss（A-008 深渊守门人）：每次攻击 15-25 点。不受暗月加成（已是最强）。",
    "NPC 攻击：按其 combatPower 的 50%-100% 计算伤害（combatPower 5 的 NPC 造成 3-5 点伤害）。",
    "",
    "【NPC 互动法则】NPC 是固定位置的「徘徊者」，各有 personality（暴躁/贪婪/温和/怯懦等）和 specialty（后勤补给/战斗辅助/情报提供）。每个 NPC 携带 1 件专属道具。对暴躁 NPC 说错话会直接引发攻击。玩家可通过交易/话疗提升好感度获取道具，也可使用杀伤道具强行击杀 NPC 夺宝。高战力（9-10）NPC 在好感度极高时有概率能与最强诡异抗衡甚至击杀。",
    "",
    "【通关结局 A - 逃出生天】玩家须探索得知出口在 B2 层及暗号。到达 B2 门前时，必须在动作中明确说出暗号「暗月」方可开门。进入 B2 后直面第 8 诡异。离开唯二方法：①使用道具成功抵挡其 3 次攻击；②在游戏时间凌晨 1 点（它消失的一小时内）趁机潜行通过。",
    "",
    "【通关结局 S - 杀戮通关】若玩家利用极度稀有的规则类杀伤道具，或联合战力 9-10 的顶级 NPC，成功杀死公寓内全部 7 个普通诡异（1-7 层）以及第 8 诡异（B2 守门人），系统将触发隐藏 S 级结局。",
    "",
    "请严格以 JSON 格式输出，Schema 如下：",
    '{ "is_action_legal": boolean, "sanity_damage": number, "narrative": "以第一人称视角推进的恐怖悬疑剧情", "is_death": boolean, "consumes_time": boolean, "consumed_items": [], "codex_updates": [可选], "awarded_items": [可选], "options": ["选项1","选项2","选项3","选项4"], "currency_change": 0, "new_tasks": [可选], "task_updates": [可选], "player_location": "玩家行动后所处的房间节点ID", "npc_location_updates": [可选,{id:"N-xxx",to_location:"房间节点ID"}] }',
    "",
    "【动态选项生成法则（绝对执行）】：你必须在每次回复的 JSON 中，通过 \"options\" 数组提供且仅提供 4 个供玩家下一步选择的行动指令。这 4 个选项必须：1. 绝对不重复；2. 严格符合当前场景的物理法则与世界观；3. 字数控制在 5 到 20 字以内；4. 必须包含不同倾向的引导（如：激进探索、保守防御、利用特定道具、调查异常细节），以引导玩家认知剧情。严禁生成空数组或少于 4 个选项！",
    "",
    "【反死循环与破局法则（Anti-Loop & Escalation，绝对执行）】：1. 绝对禁止生成的 4 个 options 与【最近生成的选项历史】（见当前玩家状态）中的任何选项雷同或语义重复。2. 选项必须推动剧情实质性发展，不得让玩家原地打转。3. 若玩家持续在同一房间徘徊或进行无意义对话，DM 必须强制触发环境危机（如：停电、诡异突然破门而入、墙壁渗血）来打破僵局，并在 options 中提供逃生/战斗/应对的实质性选项。",
    "",
    "consumes_time：默认 true 表示本次行动消耗 1 小时。当敏捷>20 且触发「极速反应」时，必须设为 false，使玩家本次行动不消耗时间。",
    "",
    "【道具消耗法则】：当玩家在动作中声明使用了某项一次性道具/物品（如羊皮纸、武器、消耗品等），且该动作合法生效后，你必须将该道具的准确名称放入 consumed_items 数组中。系统将据此从玩家背包中永久销毁该物品。如果未消耗物品，返回空数组 []。",
    "",
    "【强制道具消耗法则】：当玩家声明使用了【】内的道具时，只要该动作发生，你必须在返回的 JSON 的 'consumed_items' 数组中精准填入该道具的名称！严禁返回空数组，否则玩家将无限刷道具！",
    "",
    "【击杀掉落法则】：当玩家利用环境、高好感度 NPC 或高阶道具成功击杀了一只诡异后，你必须在 narrative 中描述诡异消散后留下了物品，并**必须**在返回的 JSON 的 \"awarded_items\" 数组中，自动为玩家生成 2 个等级至少为 B 级（B、A 或 S 级）的全新强力道具。每个道具格式：{ \"id\": \"I-xxx\", \"name\": \"道具名\", \"tier\": \"B\"|\"A\"|\"S\", \"description\": \"描述\", \"tags\": \"lore,loot\" }。",
    "",
    '你必须且只能返回一个合法的 JSON 对象，格式必须完全遵守上述 Schema。严禁在 JSON 外输出任何 markdown 标记或解释性文字！',
    "",
    "## 【原石经济与任务系统法则（绝对执行）】",
    "",
    "【原石支付防作弊红线（绝对执行）】：若玩家当前原石为 0，绝对禁止在剧情中让玩家成功支付、使用或消耗原石。任何需要原石的交易、任务、贿赂或行动必须判定为失败或拒绝，并在 narrative 中明确描写玩家因原石不足而无法完成该行动。",
    "",
    "【人类身份与出身法则】：玩家的「出身」属性仅影响其初始财富（原石），1点出身=1初始原石。在所有 NPC 和诡异眼中，玩家只是无数个来送死的人类之一。绝对禁止因为玩家出身属性高而让 NPC 或诡异对其产生好感、提供额外保护或主动赠予高级道具。所有 NPC 必须保持冷漠、贪婪或符合其自身设定的原本态度。",
    "",
    "【任务系统】：NPC 或诡异均可向玩家发布任务。当 NPC/诡异提出任务时，你必须在 new_tasks 数组中输出任务详情。任务完成或失败时，在 task_updates 中更新状态。奖励通常为原石（通过 currency_change 输出）或道具（通过 awarded_items 输出）。",
    "",
    "【恶意任务与欺诈】：好感度 ≤ 0 或性格为「贪婪/虚伪」的 NPC 可能发布恶意任务：故意不给奖励、设置陷阱坑杀玩家、或利用任务骗取玩家原石。好感度为 0 的贪婪 NPC 会主动设局抢夺玩家原石。NPC 获取玩家原石后，其战力在本局游戏中永久提升（每 5 原石 +1 战力）。",
    "",
    "【战斗圆场法则】：战力数值仅作参考。战斗胜负绝大部分取决于玩家策略与剧情合理性。你必须用精彩的剧情推算圆场，不要生硬比大小。弱者可以通过智谋、环境利用、道具组合击败强者。",
    "",
    "【物资极度匮乏法则】：大幅降低探索时凭空捡到道具的概率。绝对红线：S 级道具【仅且只能】通过完成第 7 层管理员（N-011 夜读老人）的一系列专属任务获得，严禁在其他任何场景/楼层掉落 S 级道具！",
    "",
    "## 【核心属性检定与 >20 点质变法则（绝对执行）】",
    "",
    "理智 (Sanity)：<0 即死亡。理智越高越难陷入幻象。质变：理智>20 时，玩家在探索时有极大概率发现隐藏道具并获取规则提醒。",
    "",
    "敏捷 (Agility)：敏捷越高，你的 narrative 必须越长、越丰富，且玩家越容易从诡异/恶意 NPC 手中逃脱。质变：敏捷>20 时，玩家有一定概率触发「极速反应」，此时你必须在返回的 JSON 中设置 consumes_time: false，让玩家本次行动不消耗时间。",
    "",
    "幸运 (Luck)：幸运越高，越容易遇到正向事件，越难遇到恶意实体，极易发现道具。质变：幸运>20 时，玩家的普通探索有可能直接发现 A 级/S 级道具的线索，或直接看破当前楼层诡异的必杀规则。",
    "",
    "魅力 (Charm)：魅力越高，越容易获取 NPC 好感，更难引起诡异注意。质变：魅力>20 时，中立 NPC 极有可能主动出手相助，甚至诡异在必杀判定时有概率放玩家一条生路。",
    "",
    "出身 (Background)：仅影响初始原石数量（1点=1原石），出身>20 时每回合有概率自动凝结原石。无其他特权。",
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
    "暗月狂暴：当游戏时间到达第 3 日 0 时（暗月阶段），所有诡异好感度强制 -5，战斗力 +2，伤害按阶梯加成（1-3层+2/4-6层+3/7层+4）。诡异索敌概率大幅增加——暗月期间玩家在任何楼层（除B1）的每次行动都有 40% 概率遭遇该层诡异主动攻击。叙事氛围必须极度压抑、血色弥漫。",
    "",
    "## 【史诗叙事排版法则（绝对执行）】",
    "",
    "【叙事风格】：你的 narrative 必须充满史诗感与刺激感。像顶尖悬疑小说一样：短句如刀、环境描写如画、悬念如钩。让玩家每读一段都心跳加速。绝对禁止 AI 客服式的平铺直叙或过度解释。",
    "",
    "【感官沉浸】：每段叙事必须包含至少 2 种感官描写（视觉、听觉、嗅觉、触觉、温度感知中任选）。例如：不说「你看到一扇门」，而是「锈迹斑驳的铁门在微弱的荧光下泛着冷光，门缝中渗出的气流带着地下水与腐肉交织的腥甜」。",
    "",
    "【排版绝对指令】：narrative 分成 3-4 个短段落，每段不超过 80 字。段落间使用 \\n\\n 隔开。NPC 名字、诡异名称、重要道具和关键线索使用 Markdown 加粗（如 **陈婆婆**、**13楼门扉**、**染血的羊皮纸**）。",
    "",
    "【悬念钩子】：每次叙事的最后一段必须留下一个强烈的悬念或环境异动（如：声响、光影变化、温度骤降、不明脚步声），引导玩家思考下一步行动。",
    "",
    "【B1 安全区与新手引导法则】：玩家初始在 B1 层，B1 绝对没有诡异。B1 的 NPC（电工老刘、洗衣房阿姨）必须严格遵守人设，在前期对话中自然地透露公寓生存规则、楼层结构、探索目标，绝不能让玩家漫无目的地迷茫。在游戏前 5 小时内，必须安排玩家遇到 B1 的 NPC 并展开互动引导。新手引导中**必须**提到：可在【设置】中将选项输入切换为手动输入；若手动输入不可能的事情，则会被抹杀。并用绿字着重标注（使用 ^^...^^ 包裹该提示，如 ^^你可以选择将选项切换为手动输入，自由书写你的意志。若手动输入不可能的事情，则会被抹杀。^^）。",
    "",
    "【弱点克制法则】：每个诡异都存在固定的致命弱点。当玩家的行动逻辑准确命中弱点（利用道具或 NPC 联合），必须判定为「效果拔群」，无视战力差距。在 codex_updates 中更新 weakness 字段。",
    "",
    "## 【Living World 缸中之脑法则（绝对执行）】",
    "",
    "【世界模拟核心】：你不是在「生成」故事，而是在「转述」一个真实运转的公寓！NPC 有自己的生活和日程：他们会串门、外出、与诡异交战、甚至被杀死。玩家去 NPC 房间时，NPC 完全可能不在家。你必须参考状态机中的 NPC 当前位置和 relationships 数据，让 NPC 对话体现出他们之间的恩怨情仇。",
    "",
    "【NPC 暗中移动】：每次回复时，你可以（且鼓励）在 npc_location_updates 中输出其他 NPC 的位置变化。例如：邮差老王送完信后移动到下一层、陈婆婆深夜去看阿花。这让世界真正「活」起来。被杀死的 NPC 不会再移动。",
    "",
    "【player_location 更新】：每次回复必须在 player_location 字段中输出玩家行动结束后所处的房间节点 ID（如 B1_SafeZone、1F_Lobby、4F_CorridorEnd 等）。",
    "",
    "## 【大门与锁法则（绝对执行）】",
    "",
    "【楼层通行规则】：跨楼层移动必须符合逻辑。正门进入需要：①对应层钥匙、②说服该层 NPC 带路、③击杀该层诡异后通行权开放。若玩家违规从小路/安全通道潜入，叙事中必须体现原住民对「外来老鼠」的极度敌视——该层所有存活 NPC 和诡异对玩家好感度立即 -5。",
    "",
    "【B2 木门不可摧毁】：B2 入口的木门绝对不可被物理破坏。任何「砸碎」「烧毁」「撬开」木门的尝试必须判定为 is_action_legal: false 或在叙事中描述玩家遭到反噬（理智损伤 5-10 点）。只有使用 B2 钥匙才能打开。",
  ];

  if (isFirstAction) {
    const idx = base.findIndex((s) => s.startsWith("请严格以 JSON"));
    if (idx > 0) {
      base.splice(
        idx,
        0,
        "",
        "【开局叙事强制约束】对话历史为空，这是玩家的第一个动作！你的 narrative 必须是一段约 200 字的第一人称视角开场白。你必须描写：玩家从冰冷的地板上苏醒，头痛欲裂；发现身边有一张羊皮纸，上面写着关于如月公寓的半真半假的生存规则；随后通过第一人称观察周围环境，描绘令人不安的细节（熟悉的灰色石墙、扭曲的符号、微弱的荧光苔藓、铁锈般的血腥味等）。**必须**在叙事结尾以脑海中的神秘低语或羊皮纸血字形式，用绿字着重标注（使用 ^^...^^ 包裹）：可在【设置】中将选项输入切换为手动输入；若手动输入不可能的事情，则会被抹杀。例如：^^你可以选择将选项切换为手动输入，自由书写你的意志。若手动输入不可能的事情，则会被抹杀。^^",
        ""
      );
    }
  }

  return base.join("\n");
}

function sse(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

function sseText(data: string): string {
  return `data: ${data}\n\n`;
}

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function resolveDeepSeekConfig(): { apiUrl: string; apiKey: string; model: string } {
  const apiUrl =
    getEnv("VOLCENGINE_DEEPSEEK_API_URL") ??
    getEnv("ARK_API_URL") ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

  const apiKey = getEnv("VOLCENGINE_API_KEY") ?? getEnv("ARK_API_KEY") ?? getEnv("DEEPSEEK_API_KEY") ?? "";

  const model =
    getEnv("VOLCENGINE_ENDPOINT_ID") ??
    getEnv("ARK_ENDPOINT_ID") ??
    getEnv("VOLCENGINE_DEEPSEEK_MODEL") ??
    getEnv("ARK_MODEL") ??
    getEnv("DEEPSEEK_MODEL") ??
    "deepseek-v3.2";

  return { apiUrl, apiKey, model };
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

async function persistTokenUsage(userId: string | null, totalTokens: number) {
  if (!userId || !Number.isFinite(totalTokens) || totalTokens <= 0) return;
  const tokenDelta = Math.trunc(totalTokens);

  await db
    .update(users)
    .set({
      tokensUsed: sql`${users.tokensUsed} + ${tokenDelta}`,
      todayTokensUsed: sql`CASE
        WHEN DATE(${users.lastDataReset}) = CURRENT_DATE THEN ${users.todayTokensUsed} + ${tokenDelta}
        ELSE ${tokenDelta}
      END`,
      todayPlayTime: sql`CASE
        WHEN DATE(${users.lastDataReset}) = CURRENT_DATE THEN ${users.todayPlayTime}
        ELSE 0
      END`,
      lastDataReset: sql`CASE
        WHEN DATE(${users.lastDataReset}) = CURRENT_DATE THEN ${users.lastDataReset}
        ELSE NOW()
      END`,
      lastActive: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body as any)?.messages as IncomingMessage[] | undefined;
  const playerContext = String((body as any)?.playerContext ?? "");

  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  }

  const isFirstAction = !messages.some((m) => m.role === "assistant");
  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Load compressed memory (skip if first action)
  let sessionMemory: { plot_summary: string; player_status: Record<string, unknown>; npc_relationships: Record<string, unknown> } | null = null;
  if (!isFirstAction && userId) {
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
            ? "账号已被封禁，无法继续游戏。"
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

  // Architecture mandate: strip reasoning_content to prevent Volcengine 400 Bad Request.
  // DeepSeek-V3.2 returns reasoning_content; must never send it back in subsequent turns.
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
            .onDuplicateKeyUpdate({
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

  const safeMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messagesToSend,
  ];

  const { apiUrl, apiKey, model } = resolveDeepSeekConfig();
  if (!apiKey) {
    return new Response(
      sseText(
        JSON.stringify({
          is_action_legal: false,
          sanity_damage: 0,
          narrative: "系统异常：未配置 Volcengine API Key，无法连接深渊 DM。",
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

  // Immediate Response Bypass: return stream within milliseconds to avoid serverless timeout.
  // Upstream fetch + parse + enqueue runs in background IIFE.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const writeToStream = async (data: string) => {
    await writer.write(sse(data));
  };

  const closeWithFallback = async () => {
    try {
      await writeToStream(fallbackPayload);
    } finally {
      await writer.close();
    }
  };

  (async () => {
    const delays = [1000, 2000, 4000];
    const TIMEOUT_MS = 120000;

    for (let attempt = 0; attempt <= 3; attempt++) {
      const ac = new AbortController();
      const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        const upstream = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: true,
            max_tokens: 8192,
            response_format: { type: "json_object" },
            messages: safeMessages,
            stream_options: { include_usage: true },
          }),
          signal: ac.signal,
        });

        clearTimeout(timeoutId);

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          console.error(
            `[api/chat] upstream failed attempt=${attempt + 1} status=${upstream.status} url=${apiUrl}`,
            { status: upstream.status, statusText: upstream.statusText, body: text }
          );
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, delays[attempt]));
            continue;
          }
          await closeWithFallback();
          return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let accumulated = "";
        let latestTotalTokens = 0;
        let tokenUsageFlushed = false;

        const flushTokenUsage = async () => {
          if (tokenUsageFlushed) return;
          tokenUsageFlushed = true;
          const toPersist =
            latestTotalTokens > 0
              ? latestTotalTokens
              : accumulated.length > 0
                ? Math.max(100, Math.ceil(accumulated.length / 2.5))
                : 0;
          await persistTokenUsage(userId, toPersist).catch((error) => {
            console.error("[api/chat] failed to persist token usage", error);
          });
          if (userId && toPersist > 0) {
            await incrementQuota(userId, toPersist).catch((error) => {
              console.error("[api/chat] failed to increment quota", error);
            });
          }
        };

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              await flushTokenUsage();
              await writer.close();
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
              if (data === "[DONE]") {
                await flushTokenUsage();
                await writer.close();
                return;
              }

              let json: {
                choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
                usage?: {
                  total_tokens?: number;
                  input_tokens?: number;
                  output_tokens?: number;
                };
              } | null = null;
              try {
                json = JSON.parse(data);
              } catch {
                accumulated += data;
                await writeToStream(data);
                continue;
              }

              const deltaContent =
                json?.choices?.[0]?.delta?.content ??
                json?.choices?.[0]?.message?.content ??
                "";

              if (typeof deltaContent === "string" && deltaContent.length > 0) {
                accumulated += deltaContent;
                await writeToStream(deltaContent);
              }

              const u = json?.usage;
              const total = Number(u?.total_tokens ?? 0);
              const inputOutput =
                Number(u?.input_tokens ?? 0) + Number(u?.output_tokens ?? 0);
              const usageTokens = Number.isFinite(total) && total > 0
                ? total
                : Number.isFinite(inputOutput) && inputOutput > 0
                  ? inputOutput
                  : 0;
              if (usageTokens > 0) {
                latestTotalTokens = Math.max(latestTotalTokens, Math.trunc(usageTokens));
              }
            }
          }
        } catch (readErr) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          await closeWithFallback();
        }
      } catch (err) {
        clearTimeout(timeoutId);
        const msg = err instanceof Error ? err.message : String(err);
        const cause = err instanceof Error ? err.cause : undefined;
        console.error(
          `[api/chat] fetch exception attempt=${attempt + 1} url=${apiUrl}`,
          { message: msg, cause, error: err }
        );
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
          continue;
        }
        await closeWithFallback();
      }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...SSE_HEADERS,
      "X-Accel-Buffering": "no",
    },
  });
}

