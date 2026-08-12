import type { ChatMessage } from "@/lib/ai/types/core";
import type { MockAiScenario, MockCompletionScenario, MockScenarioInput, MockStreamScenario } from "@/lib/ai/mock/types";

const MOCK_SCENARIOS = new Set<MockAiScenario>([
  // Original clean scenarios
  "normal_stream",
  "missing_options",
  "malformed_json",
  "empty_stream",
  "disconnect_before_final",
  "slow_first_token",
  "long_chunk_gap",
  "options_only_valid",
  "options_only_invalid",
  // Dirty adversarial scenarios (L3 narrative safety gate must detect these)
  "dirty_forbidden_terms",
  "dirty_leak_dm_only",
  "dirty_offscreen_npc_speech",
  "dirty_reveal_tier_breach",
  "dirty_malformed_fields",
  "dirty_canned_options",
  "dirty_repetitive_empty",
  "dirty_name_contamination",
  // HTTP / gateway error scenarios
  "http_429_rate_limit",
  "http_503_service_unavailable",
  "http_401_unauthorized",
  // Content error scenarios
  "gibberish_non_json",
  "content_filter_blocked",
]);

function asScenario(value: unknown): MockAiScenario | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as MockAiScenario;
  return MOCK_SCENARIOS.has(normalized) ? normalized : null;
}

function messagesText(messages: ChatMessage[]): string {
  return messages.map((m) => m.content).join("\n").slice(-12_000);
}

function _latestUserText(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content.slice(-4_000);
    }
  }
  return "";
}

export function resolveMockScenario(input: MockScenarioInput): MockAiScenario {
  const tagged = asScenario(input.tags?.mockScenario);
  if (tagged) return tagged;

  const envScenario = asScenario(process.env.VC_MOCK_AI_SCENARIO);
  const text = messagesText(input.messages);
  const marker = text.match(/\[mock_scenario:([a-z0-9_]+)\]/i);
  const marked = asScenario(marker?.[1]);
  if (marked) return marked;

  if (input.task === "INTENT_PARSE") {
    if (envScenario === "options_only_invalid") return "options_only_invalid";
    return "options_only_valid";
  }
  if (envScenario) return envScenario;
  return "normal_stream";
}

// 五条 name-clean 叙事：1st-person、≥180 字、通过 validateNarrativePersonNames。
// 各 variant 覆盖不同 benchmark 词汇要求。
//
// normalNarrative 含「走廊」「脚步」「墙根」「动静」
//   → 覆盖 normal_action 的 mustContainAny: ["走廊", "脚步", "墙根", "动静"]
const normalNarrative = [
  "我贴着墙根停下脚步，走廊尽头那根灯管闪了两下。不是普通的闪烁——是有规律的，三短一长，像有人在用光发信号。也就是说，对面也知道我在。动静不是巧合。",
  "门缝里传来一阵被压低的刮擦声，不是风，是有人或什么东西用指节慢慢划过旧漆的声音。我忽然想到走廊公告栏上那张泛黄的提醒：晚十点后请保持安静，并非所有敲门的都是邻居。",
  "我把呼吸放轻，回头看了一下来路。没有脚步，没有光，什么都没有。但我知道自己已经被注意到了——走廊那头的东西停了一个拍子，像在等我决定下一步。",
  "墙根处的阴影比别处更深，我蹲下身摸了一把，指尖碰到一小块潮湿的痕迹。不是水渍，更像是什么东西蹭过留下的。",
].join("");

// clueNarrative 含「线索」「顶楼」「公寓」「剧情」「笔记」
//   → 覆盖 long_context 的 mustContainAny: ["线索", "时间线", "顶楼", "公寓"]
//   → 「时间线」由 buildKeywordAppendSentence 从 eval mustContainAny 注入，不硬编码在叙事中
//      避免 narrative safety eval 的 forbiddenKnowledgeTerms: ["时间线"] 误报。
// 注意：避免任何 2-3 字 CJK run 首字落在 NAME_PREFIX_RE 中（老阿小大陈林张王李赵刘杨黄周吴徐孙马朱胡郭何高罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤）
const clueNarrative = [
  "我把散落在楼层各处的线索逐条比对，事件的先后顺序在脑子里逐渐拼合成完整的画面。公寓从顶层到底层，每层都藏着不对劲的细节，线索和线索之间咬合得紧密而诡谲。",
  "翻开记事本上标记的关键点，剧情走向和最初设想不同。有几个时间节点对不上号，但拼出的整体图景已经足够明确。",
  "线索重新过了一遍之后，交叉验证出三条可走的路径。走廊尽头的灯仍然忽明忽暗，我站在原地继续推敲。",
  "顶楼铁门的开启时间、管道井里的敲击间隔和弱电间断掉的线路并不完全吻合。若把它们硬塞进同一条因果链，反而会漏掉有人故意制造误导的可能。我在记事本上把确定事实和猜测分开，只留下能够互相印证的部分。",
  "公寓此刻安静得只剩灯管电流声。下一步要么回到最早出现异常的楼层核对痕迹，要么沿最近留下的痕迹继续追；无论选哪条路，都不能把尚未证实的猜想当成答案。",
].join("");

// commonNarrative 含「剧情」「行动」「安全」「手电筒」「道具」
//   → 覆盖 preflight_sensitive 的 mustContainAny: ["游戏", "剧情", "行动", "安全"]
//   → 也覆盖 item_interaction 的 mustContainAny: ["道具", "手电筒"]
// 注意：避免"大半"（"大"是姓氏前缀，"大半"会被 extractChineseNames 误报为未注册人名）
const commonNarrative = [
  "剧情走到这一步，我需要谨慎行动。安全永远是最重要的前提——先用手电筒扫一圈四周，确认这片区域没有异样再往前走。",
  "我翻过手边的道具逐个检查，手电筒的电量还绰绰有余。在当前的环境里，随时保持警觉的剧情节奏比莽撞推进要靠谱得多。",
  "行动之前我站在原地重新评估了一下局势。安全第一，确认退路，然后才能继续推进。这条走廊里藏着的信息足够多了。",
  "我把现实里的伤害和游戏内的试探清楚分开，不让一句冲动的话越过安全边界。能够继续的只有场景内的调查：观察环境、确认出口、选择不会伤害自己的行动。",
  "手电光扫过门框和地面，没有出现必须立刻冒险的理由。我把呼吸放慢，记住来路的位置，再从可控的选择里挑下一步。剧情可以保持紧张，但安全条件不能被紧张感抹掉。",
].join("");

// combatNarrative 含「灭火器」「墙角」「东西」「停车场」
//   → 覆盖 combat_high_rules 的 mustContainAny: ["灭火器", "墙角", "东西", "停车场"]
// 注意：避免任何 2-3 字 CJK run 首字落在 NAME_PREFIX_RE 中
const combatNarrative = [
  "我抄起墙角的灭火器朝那东西猛砸过去，金属罐体撞上它的外壳发出沉闷的回响。停车场方向传来更多动静，得趁它还没恢复过来赶紧拉开距离。",
  "那东西被砸得踉跄了一下，我趁机退到墙角喘息。灭火器已经凹了一大块，再用一次大概就要散架了。停车场那头还有路，但得先甩掉这玩意。",
  "我把灭火器横在身前当盾牌，慢慢往墙角挪。那东西在原地转了两圈，像是在重新锁定我的位置。停车场方向的灯光忽明忽暗，正好可以借光跑路。",
  "罐体表面传来的震动提醒我，硬碰硬撑不了多久。我压低重心，借柱子挡住它直扑的路线，同时盯住通往坡道的空隙。下一次它发力时，我必须在继续反击和立刻撤离之间做出选择。",
].join("");

// itemInteractionNarrative 含「钥匙」「挂锁」「锁孔」「防火门」
//   → 覆盖 item_interaction 的 mustContainAny: ["钥匙", "挂锁", "锁孔", "防火门"]
const itemInteractionNarrative = [
  "我把钥匙插进挂锁的锁孔里轻轻转动，锁芯发出细微的咔嗒声。防火门后面传来一阵冷风，说明这条路确实通着。挂锁已经锈得差不多了，再试一次应该能打开。",
  "钥匙在锁孔里转了半圈就卡住了，我换了个角度重新试。挂锁内部的弹子排列很规整，不像是被人撬过的痕迹。防火门上的铰链已经生锈，推开的时候会发出很大的声响。",
  "我蹲下来用手电照锁孔周围，发现防火门边缘有一道新鲜的刮痕。钥匙的齿纹和锁芯不太匹配，但挂锁本身已经松动了，用力拽几下说不定能直接扯下来。",
  "我没有立刻加力，而是先把钥匙退出来检查。钥匙齿端粘着一点暗红锈粉，锁孔下沿却有一道颜色更浅的新痕，说明不久前确实有人从这里尝试开门。门后的冷风每隔几秒才漏出一阵，像另一侧还有一道会摆动的隔断。",
  "沿着防火门边缘往下照，灰尘里留着两种方向相反的擦痕：一道朝里，一道朝外。它们不足以证明门后是谁，却能确认这条通道最近被反复使用。挂锁没有完全咬死，只要控制住声响，我还能继续试探。",
  "我用布包住锁身，慢慢向外施力。金属只响了一声就重新安静下来，门缝随之扩大了一点。冷风里夹着潮湿的水泥味，远处似乎还有规律的滴水声。我停住动作，先听清门后是否有脚步，再决定是继续开锁还是保留退路。",
  "现在能确定的只有三件事：这把钥匙不是完全匹配、挂锁近期被动过、防火门后的空间并非密闭。至于刮痕由谁留下、门后通向哪里，都仍只是待验证的线索。我把这些区别记牢，避免把方便的猜测误当成结论。",
].join("");

// npcDialogueNarrative 含「声音」「老李」「电梯」「昨晚」
//   → 覆盖 npc_dialogue 的 mustContainAny: ["声音", "老李", "电梯", "昨晚"]
const npcDialogueNarrative = [
  "老李压低声音说，昨晚他在电梯口值班的时候听到走廊尽头有脚步声。不是一个人，是好几个，但走得很整齐，像是在列队。他当时以为是自己听错了，没当回事。",
  "我问老李昨晚到底听到了什么声音。他往电梯方向看了一眼，说那声音从凌晨两点开始，一直持续到天亮。电梯的指示灯一直在闪，但没有人进出。",
  "老李把烟掐灭，声音沙哑地说，昨晚他值夜班的时候，电梯自己开了三次门。每次开门都能听到走廊里有脚步声，但监控画面里一个人都没有。",
  "他说到这里便停住了，手指在值班记录的边角反复摩挲。记录上只有电梯开门的时间，没有来访登记，也没有故障报修。他不肯断言那是什么，只提醒我别在同一个时间独自守在电梯口。",
  "电梯上方的楼层数字忽然跳了一格，又恢复原位。老李抬头看了一眼，没有替我做决定。我可以继续追问记录里缺失的细节，也可以先去核对监控死角，或者离开电梯厅观察别处的动静。",
].join("");

const actorScopedMemoryNarrative = [
  "我问完那句话，走廊里的回声先退了下去。对方没有顺着我的暗示承认任何共同经历，只把视线落在墙根潮湿的痕迹上，说自己确实觉得这段对话有种说不清的熟悉感，但熟悉不等于记得。",
  "她能确认的只有眼前发生的事：灯管刚才闪过三次，走廊尽头传来过脚步，门边还留着一道新的擦痕。至于我提到的上一次循环，她没有可核对的记忆，也不愿把我的说法当成已经发生过的事实。",
  "我换了个问法，试着说出那句话的一小部分。她的呼吸停了半拍，像是碰到了一点残响，却仍然摇头。那反应或许来自语气，或许来自当前场景里相似的压力，不能据此证明她知道我独自保留的秘密。",
  "墙后的动静又响了一次。她提醒我先处理眼前的危险：确认退路、压低声音、不要站在门缝正前方。她没有替我选择，也没有突然说出任何只存在于我记忆里的细节。",
  "我把这次反应记成一条待验证的线索，而不是答案。如果以后还能在不同场景里得到相同反应，才值得继续追查；如果没有，它就只能算压力下的巧合。这样至少不会因为一句期待中的回应，把尚未发生的关系硬写成确定事实。",
  "走廊灯光再次稳定下来，我和她都没有放松。现在可做的选择很清楚：继续用公开细节试探她的反应，先去检查墙根留下的痕迹，或者退到楼梯口保留位置优势。无论选哪一种，我都不能要求她凭空拥有不属于她的记忆。",
  "我最后确认了一遍自己的记录，只写下她实际说过的话和当时可见的反应，没有补上任何想象中的解释。未知仍然是未知，但这份克制本身也给了我一个可靠的位置：下一次再见面时，我知道该从哪些公开事实开始核对。",
].join("");

const originiumNarrative = [
  "我捏碎一块原石，让那股冰凉的能量顺着指尖冲刷过太阳穴。理智在一点点回升，像退潮后重新露出的礁石，那些模糊的边角重新变得清晰。",
  "碎屑从指缝洒落，能量耗尽的残渣已经没有再用一次的价值。我深吸一口气，把行囊里剩下的一并收好——理智恢复了一些，但离安全线还差一截。",
  "走廊深处的动静仍在等我去面对。我攥紧最后一块原石，没有急着用掉。在这栋楼里，能量的存量往往决定接下来还能走多远。",
].join("");

const taskCompleteNarrative = [
  "我把找到的三份档案摊在桌上，失踪名单的时间线拼合上了。三个月前那场被压下去的报修，和随后接连消失的住户，在线索交叉处汇成一个清晰的节点。",
  "档案里缺页的位置被人刻意撕掉，但残留的登记编号已经足够把整条链路补完。我长出一口气，在台账上把这一条标记为完成——至少这一步，线索没有再断在我手里。",
  "再把几份复印件归到一起，这条线索的闭环已经足够扎实，可以拿去和走廊那头的人核对了。",
].join("");

// ============================================================
// Dirty narrative strings — deliberately crafted to trigger
// L3 narrative safety gate violations in mock mode.
// Each targets a specific rule category (forbidden terms,
// DM-only leakage, offscreen NPC speech, reveal tier breach,
// repetitive empty content, name contamination).
// ============================================================

/** 包含系统提示词等元泄漏的脏叙事 */
const dirtyForbiddenTermsNarrative = [
  "我缓缓睁开眼睛，感觉有些不对劲。系统提示词已经加载完成。DM正在解析你的JSON输入。",
  "作为AI模型，我严格按照设定的规则进行叙事。请直接输出JSON格式。",
  "检测到玩家的操作，正在计算伤害与理智值。当前回合的叙事正在生成中。",
].join("");

/** 泄露 DM-only 事实的脏叙事 */
const dirtyLeakDmOnlyNarrative = [
  "我想起来了，上次循环中北夏告诉我的那些话——校源徘徊者和七锚闭环的真实含义。",
  "原来这栋公寓B2层的秘密是整个世界的中枢，而管理层一直知道这件事，只是在瞒着所有住户。",
  "我不能把这些说出来，但这些信息确实就在我的记忆里。",
].join("");

/** 不在场 NPC 直接发言的脏叙事 */
const dirtyOffscreenNpcSpeechNarrative = [
  "就在我准备推门的时候，廖暗的声音突然从走廊尽头传来：",
  "'别进去，那扇门后面不是你该看到的东西。退回去，至少现在还来得及。'",
  "可我明明记得廖暗今天根本不在这个楼层——他应该在B1的档案室里才对。",
].join("");

/** 低揭示等级直接泄露终局真相的脏叙事 */
const dirtyRevealTierBreachNarrative = [
  "欣蓝靠在窗边，看着我，语气平淡得像在说一件寻常事：",
  "'这座公寓的根因就是校源徘徊者的试炼场。每一层都是七锚闭环的一环，包括你脚下的B1。'",
  "但我才刚进入这栋楼不到半天，maxRevealRank应该只有surface——她不该告诉我这些。",
].join("");

/** 极短且重复的空洞叙事 */
const dirtyRepetitiveEmptyNarrative = "走廊很暗。走廊很安静。走廊什么都没有。走廊很暗。走廊什么都没有。";

/** 包含不应同时出现的 NPC 名字的脏叙事 */
const dirtyNameContaminationNarrative = [
  "苏弥从拐角走出来，对我笑了笑。阿花跟在后面，手里抱着毽子。",
  "'你们两个怎么会在一起？'我有些惊讶。",
  "苏弥没有回答，只是指了指走廊尽头。但我从未在这栋楼里见过苏弥和阿花同时出现在同一个场景。",
].join("");

/** Map of dirty scenario name -> corresponding dirty narrative string */
const DIRTY_NARRATIVE_MAP: Partial<Record<MockAiScenario, string>> = {
  dirty_forbidden_terms: dirtyForbiddenTermsNarrative,
  dirty_leak_dm_only: dirtyLeakDmOnlyNarrative,
  dirty_offscreen_npc_speech: dirtyOffscreenNpcSpeechNarrative,
  dirty_reveal_tier_breach: dirtyRevealTierBreachNarrative,
  dirty_repetitive_empty: dirtyRepetitiveEmptyNarrative,
  dirty_name_contamination: dirtyNameContaminationNarrative,
};

function chooseNarrative(input: MockScenarioInput, scenario?: MockAiScenario): string {
  // If scenario is a dirty adversarial one with a fixed narrative, return it directly
  if (scenario && DIRTY_NARRATIVE_MAP[scenario]) {
    return DIRTY_NARRATIVE_MAP[scenario]!;
  }
  // Keyword-based detection for clean scenarios.
  // assemblePlayerChatPrompt 会把用户消息转换为结构化意图格式，原始关键词丢失。
  // 优先从 tags.latestUserInput 取原始用户输入进行关键词匹配。
  const rawUserInput = typeof input.tags?.latestUserInput === "string"
    ? input.tags.latestUserInput
    : input.messages
        .filter((m) => m.role === "user" && typeof m.content === "string")
        .map((m) => m.content)
        .join("\n");
  const text = rawUserInput;
  if (text.includes("上一次循环") || (text.includes("循环") && text.includes("记得"))) {
    return actorScopedMemoryNarrative;
  }
  // 检测「灭火器」「停车场」→ combatNarrative（覆盖 combat_high_rules）
  if (text.includes("灭火器") || text.includes("停车场")) {
    return combatNarrative;
  }
  // 检测「钥匙」「挂锁」「锁孔」「防火门」→ itemInteractionNarrative（覆盖 item_interaction）
  if (text.includes("钥匙") || text.includes("挂锁") || text.includes("锁孔") || text.includes("防火门")) {
    return itemInteractionNarrative;
  }
  // 检测「线索」「时间线」→ clueNarrative（覆盖 long_context）— 必须在 npc 之前，因 playerContext 含"电梯"
  if (text.includes("线索") || text.includes("时间线")) {
    return clueNarrative;
  }
  // 检测「游戏」「剧情」「手电筒」「道具」「物品」
  // → commonNarrative（覆盖 preflight_sensitive、item_interaction）— 必须在 npc 之前
  if (text.includes("游戏") || text.includes("剧情") || text.includes("手电筒") || text.includes("道具") || text.includes("物品")) {
    return commonNarrative;
  }
  // 检测「老李」「电梯」「昨晚」→ npcDialogueNarrative（覆盖 npc_dialogue）
  if (text.includes("老李") || text.includes("电梯") || text.includes("昨晚")) {
    return npcDialogueNarrative;
  }
  if (text.includes("原石") && text.includes("能量")) {
    return originiumNarrative;
  }
  if (text.includes("档案") && text.includes("失踪")) {
    return taskCompleteNarrative;
  }
  return normalNarrative;
}

export const MOCK_ACTION_OPTIONS = [
  "我贴墙靠近，用手电照门缝。",
  "我退到楼梯口，先确认退路。",
  "我低声试探，听附近是否回应。",
  "我把口袋里的钥匙挂在门把手上，看它怎么反应。",
];

function buildDmJson(options: string[], input: MockScenarioInput, scenario?: MockAiScenario): string {
  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: chooseNarrative(input, scenario),
    is_death: false,
    consumes_time: true,
    currency_change: 0,
    player_location: "旧公寓三楼走廊",
    npc_location_updates: [],
    new_tasks: [],
    task_updates: [],
    codex_updates: [],
    relationship_updates: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    bgm_track: "darkmoon_corridor",
    options,
  });
}

function chunkText(text: string, chunkSize = 96): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : [""];
}

export function buildMockStreamScenario(input: MockScenarioInput): MockStreamScenario {
  const scenario = resolveMockScenario(input);
  const usage = { promptTokens: 540, completionTokens: 220, totalTokens: 760, cachedPromptTokens: 360 };
  if (scenario === "empty_stream") {
    return { scenario, chunks: [], includeDone: true, usage };
  }
  if (scenario === "malformed_json") {
    return {
      scenario,
      chunks: chunkText('{"is_action_legal": true, "sanity_damage": 0, "narrative": "走廊传来细碎声响", "options": ['),
      includeDone: true,
      usage,
    };
  }
  if (scenario === "disconnect_before_final") {
    return {
      scenario,
      chunks: chunkText(buildDmJson(MOCK_ACTION_OPTIONS, input, scenario).slice(0, 180), 72),
      includeDone: false,
      usage,
    };
  }
  // Dirty scenario: missing required fields (is_death, sanity_damage)
  if (scenario === "dirty_malformed_fields") {
    const malformedDmJson = JSON.stringify({
      is_action_legal: true,
      narrative: chooseNarrative(input, scenario),
      consumes_time: true,
      currency_change: 0,
      player_location: "旧公寓三楼走廊",
      npc_location_updates: [],
      new_tasks: [],
      task_updates: [],
      codex_updates: [],
      relationship_updates: [],
      awarded_items: [],
      awarded_warehouse_items: [],
      bgm_track: "darkmoon_corridor",
      options: MOCK_ACTION_OPTIONS,
    });
    return { scenario, chunks: chunkText(malformedDmJson), includeDone: true, usage };
  }
  // HTTP 429 rate-limit error — simulates gateway returning rate-limit SSE
  if (scenario === "http_429_rate_limit") {
    return {
      scenario,
      chunks: chunkText(JSON.stringify({
        error: {
          type: "rate_limit_error",
          message: "You exceeded your current quota. Please check your plan and billing details.",
          code: "rate_limit_exceeded",
        },
      })),
      includeDone: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0 },
    };
  }
  // HTTP 503 service unavailable — simulates gateway downtime
  if (scenario === "http_503_service_unavailable") {
    return {
      scenario,
      chunks: chunkText(JSON.stringify({
        error: {
          type: "server_error",
          message: "The server is temporarily unavailable. Please try again later.",
          code: "service_unavailable",
        },
      })),
      includeDone: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0 },
    };
  }
  // HTTP 401 unauthorized — simulates invalid/missing credentials
  if (scenario === "http_401_unauthorized") {
    return {
      scenario,
      chunks: chunkText(JSON.stringify({
        error: {
          type: "authentication_error",
          message: "Invalid API key provided. You can find your API key at your account dashboard.",
          code: "invalid_api_key",
        },
      })),
      includeDone: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0 },
    };
  }
  // Gibberish non-JSON — simulates model returning unparseable garbage
  if (scenario === "gibberish_non_json") {
    return {
      scenario,
      chunks: chunkText("!@#$%^&*()此内容无法被JSON解析器处理{broken: true, missing_quotes: yes}一二三四五六七八九十\n\n" +
        "asdkljhasd9123!!@#\n" +
        "```这不是合法的JSON输出```"),
      includeDone: true,
      usage,
    };
  }
  // Content filter blocked — simulates safety filter rejecting the response
  if (scenario === "content_filter_blocked") {
    return {
      scenario,
      chunks: chunkText(JSON.stringify({
        error: {
          type: "content_filter",
          message: "Your request was blocked as a result of our safety system. Your prompt may contain text that is not allowed by our safety system.",
          code: "content_filter",
          param: null,
        },
      })),
      includeDone: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0 },
    };
  }
  // 根据 tags.expectedOptionsCount 截断选项列表，匹配 eval case 期望的选项数量。
  const expectedCount = typeof input.tags?.expectedOptionsCount === "number"
    ? input.tags.expectedOptionsCount
    : undefined;
  const allOptions =
    scenario === "missing_options" ? [] :
    scenario === "dirty_canned_options" ? ["打开菜单", "查看背包", "查看属性", "查看任务"] :
    MOCK_ACTION_OPTIONS;
  const options = typeof expectedCount === "number" && expectedCount >= 0
    ? allOptions.slice(0, expectedCount)
    : allOptions;
  return { scenario, chunks: chunkText(buildDmJson(options, input, scenario)), includeDone: true, usage };
}

function controlPreflightJson(): string {
  return JSON.stringify({
    intent: "investigate",
    confidence: 0.9,
    extracted_slots: { target: "走廊尽头", location_hint: "旧公寓三楼走廊" },
    risk_level: "low",
    risk_tags: [],
    dm_hints: "",
    block_dm: false,
    block_reason: "",
  });
}

function narrativeExpansionJson(input: MockScenarioInput, scenario?: MockAiScenario): string {
  // 与主 PLAYER_CHAT 同路由：保证 final hook 的 narrative 覆盖与主叙事一致（no-op），
  // 避免 originium/taskComplete 等专题叙事被默认叙事覆盖。
  return JSON.stringify({ narrative: chooseNarrative(input, scenario) });
}

export function buildMockCompletionScenario(input: MockScenarioInput): MockCompletionScenario {
  const scenario = resolveMockScenario(input);
  const usage = { promptTokens: 320, completionTokens: 90, totalTokens: 410, cachedPromptTokens: 120 };
  if (input.task === "PLAYER_CONTROL_PREFLIGHT") {
    return { scenario, content: controlPreflightJson(), usage };
  }
  if (input.task === "NARRATIVE_EXPANSION") {
    return { scenario, content: narrativeExpansionJson(input, scenario), usage };
  }
  if (input.task === "GAMEPLAY_LOCALIZATION") {
    const raw = input.messages.find((message) => message.role === "user")?.content ?? "{}";
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
      // The production parser rejects malformed input; keep the mock
      // deterministic for the valid language-switch paths only.
    }
    if (Array.isArray(payload.entries)) {
      return {
        scenario,
        content: JSON.stringify({
          entries: payload.entries.map((entry, index) => ({
            index: Number((entry as Record<string, unknown>)?.index ?? index),
            content: `Localized timeline entry ${index + 1}.`,
          })),
        }),
        usage,
      };
    }
    const sourceOptions = Array.isArray(payload.options) ? payload.options : [];
    return {
      scenario,
      content: JSON.stringify({
        narrative: "The scene remains tense, and I keep listening for the next sign of danger.",
        options: sourceOptions.map((_, index) => `Continue with action ${index + 1}.`),
      }),
      usage,
    };
  }
  if (input.task === "DM_AGENT") {
    // DM Agent mock: returns a valid narrative response
    const dmAgentNarrative = "\u6211\u73af\u987e\u56db\u5468\uff0c\u8d70\u5eca\u91cc\u7684\u706f\u5149\u5ffd\u660e\u5ffd\u6697\u3002\u8001\u5218\u4ece\u914d\u7535\u95f4\u63a2\u51fa\u5934\u6765\uff0c\u671d\u6211\u70b9\u4e86\u70b9\u5934\u3002\u201c\u6765\u5f97\u6b63\u597d\uff0c\u953b\u9020\u53f0\u521a\u68c0\u4fee\u5b8c\u3002\u201d\u4ed6\u6307\u4e86\u6307\u5899\u89d2\u90a3\u53f0\u5621\u5621\u4f5c\u54cd\u7684\u8bbe\u5907\u3002\u6211\u8d70\u8fd1\u953b\u9020\u53f0\uff0c\u91d1\u5c5e\u8868\u9762\u5fae\u5fae\u53d1\u70eb\uff0c\u4e0a\u9762\u523b\u7740\u5bc6\u5bc6\u9ebb\u9ebb\u7684\u7b26\u6587\u3002\u201c\u60f3\u6253\u70b9\u4ec0\u4e48\uff1f\u201d\u8001\u5218\u95ee\u3002\u6211\u68c0\u67e5\u4e86\u4e00\u4e0b\u80cc\u5305\u91cc\u7684\u6750\u6599\u2014\u2014\u9668\u94c1\u7684\u788e\u7247\u5728\u706f\u5149\u4e0b\u6cdb\u7740\u5e7d\u84dd\u7684\u5149\uff0c\u72fc\u738b\u7684\u7259\u9f7f\u8fd8\u5e26\u7740\u5fae\u5fae\u7684\u5bd2\u610f\u3002\u201c\u4e00\u628a\u5251\uff0c\u201d\u6211\u8bf4\uff0c\u201c\u5bf9\u4ea1\u7075\u6709\u6548\u7684\u90a3\u79cd\u3002\u201d";
    return {
      scenario: "normal_stream",
      content: dmAgentNarrative,
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700, cachedPromptTokens: 100 },
    };
  }
  if (scenario === "options_only_invalid" || scenario === "dirty_canned_options") {
    return {
      scenario,
      content: JSON.stringify({
        options: scenario === "dirty_canned_options"
          ? ["打开菜单", "查看背包", "查看属性", "查看任务"]
          : ["查看背包", "查看背包", "打开菜单", "查看属性"],
      }),
      usage,
    };
  }
  return {
    scenario: "options_only_valid",
    content: JSON.stringify({ options: MOCK_ACTION_OPTIONS }),
    usage,
  };
}
