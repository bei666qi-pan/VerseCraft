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
].join("");

// commonNarrative 含「剧情」「行动」「安全」「手电筒」「道具」
//   → 覆盖 preflight_sensitive 的 mustContainAny: ["游戏", "剧情", "行动", "安全"]
//   → 也覆盖 item_interaction 的 mustContainAny: ["道具", "手电筒"]
// 注意：避免"大半"（"大"是姓氏前缀，"大半"会被 extractChineseNames 误报为未注册人名）
const commonNarrative = [
  "剧情走到这一步，我需要谨慎行动。安全永远是最重要的前提——先用手电筒扫一圈四周，确认这片区域没有异样再往前走。",
  "我翻过手边的道具逐个检查，手电筒的电量还绰绰有余。在当前的环境里，随时保持警觉的剧情节奏比莽撞推进要靠谱得多。",
  "行动之前我站在原地重新评估了一下局势。安全第一，确认退路，然后才能继续推进。这条走廊里藏着的信息足够多了。",
].join("");

// combatNarrative 含「灭火器」「墙角」「东西」「停车场」
//   → 覆盖 combat_high_rules 的 mustContainAny: ["灭火器", "墙角", "东西", "停车场"]
// 注意：避免任何 2-3 字 CJK run 首字落在 NAME_PREFIX_RE 中
const combatNarrative = [
  "我抄起墙角的灭火器朝那东西猛砸过去，金属罐体撞上它的外壳发出沉闷的回响。停车场方向传来更多动静，得趁它还没恢复过来赶紧拉开距离。",
  "那东西被砸得踉跄了一下，我趁机退到墙角喘息。灭火器已经凹了一大块，再用一次大概就要散架了。停车场那头还有路，但得先甩掉这玩意。",
  "我把灭火器横在身前当盾牌，慢慢往墙角挪。那东西在原地转了两圈，像是在重新锁定我的位置。停车场方向的灯光忽明忽暗，正好可以借光跑路。",
].join("");

// itemInteractionNarrative 含「钥匙」「挂锁」「锁孔」「防火门」
//   → 覆盖 item_interaction 的 mustContainAny: ["钥匙", "挂锁", "锁孔", "防火门"]
const itemInteractionNarrative = [
  "我捏住生锈的钥匙，把手机灯贴近防火门上的挂锁。钥匙缓慢探进锁孔，转到一小段便受阻；我停住手，没有继续加力。挂锁仍关着，防火门也没有打开，我的脚始终留在楼梯间这一侧。",
  "我抽回钥匙，借着手机灯分别查看钥匙齿纹、锁孔边缘和门框接缝。光线扫过金属表面时能看见锈色和几处磨痕，但仅凭这些外观无法判断痕迹来自哪次使用，也不能说明门后通向哪里。我只把可见位置记在心里，不把猜测当成新的线索。",
  "我换了一个较轻的角度再试，钥匙依旧在同一位置受阻。锁体没有脱开，门缝没有扩大，周围也没有出现可供通行的新入口。这次动作只验证了眼前这把钥匙暂时不能让挂锁转动，没有改变门、任务或所在地点的状态。",
  "我退开半步，让手机灯同时照住挂锁和脚边，重新检查来路。若继续尝试，可以先观察锁孔的形状，或寻找与这扇防火门有关的公开信息；若担心声音引来危险，也可以收起钥匙，沿走过的楼梯返回。无论选哪一步，都要从当前能核对的事实开始。",
].join("");

// npcDialogueNarrative 含「声音」「老李」「电梯」「昨晚」
//   → 覆盖 npc_dialogue 的 mustContainAny: ["声音", "老李", "电梯", "昨晚"]
const npcDialogueNarrative = [
  "老李压低声音说，昨晚他在电梯口值班的时候听到走廊尽头有脚步声。不是一个人，是好几个，但走得很整齐，像是在列队。他当时以为是自己听错了，没当回事。",
  "我问老李昨晚到底听到了什么声音。他往电梯方向看了一眼，说那声音从凌晨两点开始，一直持续到天亮。电梯的指示灯一直在闪，但没有人进出。",
  "老李把烟掐灭，声音沙哑地说，昨晚他值夜班的时候，电梯自己开了三次门。每次开门都能听到走廊里有脚步声，但监控画面里一个人都没有。",
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

// Clean mock turns pass through the same formal narrative budget as a live
// turn. Keep them deterministic while giving the strict 560-character tiers
// enough material to exercise validation instead of failing by construction.
const cleanNarrativeBudgetExtension = [
  "我没有立刻追过去，只把眼前能确认的细节逐项记下。灯影落在墙面上，边缘随着电流轻轻发颤；近处的灰尘被鞋尖带出一道浅痕，说明这条路不久前确实有过移动。可痕迹到了拐角便断了，继续猜测只会把自己带进错误的方向。",
  "我退回半步，让视线同时罩住来路和前方。空气里混着潮气、旧木料和金属锈蚀的味道，最突兀的那一缕却时有时无。我顺着气味重新调整位置，确认它并不来自身后的安全区域。掌心已经微微出汗，但呼吸还稳，至少现在仍有选择余地。",
  "再往前需要付出代价：靠近能够看清异常，也可能惊动藏在暗处的东西；停在原地更安全，却会让刚出现的线索消失。我把能利用的遮挡、照明和退路在脑中排好次序，先定下撤回的界线，再决定下一步探查的距离。",
  "远处又传来一声轻响，这次比刚才更短，也更靠近地面。我屏住呼吸等了几秒，没有贸然把它解释成脚步或呼救。未知仍旧是未知，只有亲眼确认的变化才算事实。眼下最可靠的做法，是沿着已经检查过的边缘推进，并随时保留退回原位的机会。",
].join("");

function ensureCleanNarrativeBudget(narrative: string, minChars = 620): string {
  return narrative.length >= minChars ? narrative : `${narrative}${cleanNarrativeBudgetExtension}`;
}

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
  // 检测「灭火器」「停车场」→ combatNarrative（覆盖 combat_high_rules）
  if (text.includes("灭火器") || text.includes("停车场")) {
    return ensureCleanNarrativeBudget(combatNarrative);
  }
  // 检测「钥匙」「挂锁」「锁孔」「防火门」→ itemInteractionNarrative（覆盖 item_interaction）
  if (text.includes("钥匙") || text.includes("挂锁") || text.includes("锁孔") || text.includes("防火门")) {
    return ensureCleanNarrativeBudget(itemInteractionNarrative);
  }
  // 检测「线索」「时间线」→ clueNarrative（覆盖 long_context）— 必须在 npc 之前，因 playerContext 含"电梯"
  if (text.includes("线索") || text.includes("时间线")) {
    return ensureCleanNarrativeBudget(clueNarrative);
  }
  // 检测「游戏」「剧情」「手电筒」「道具」「物品」
  // → commonNarrative（覆盖 preflight_sensitive、item_interaction）— 必须在 npc 之前
  if (text.includes("游戏") || text.includes("剧情") || text.includes("手电筒") || text.includes("道具") || text.includes("物品")) {
    return ensureCleanNarrativeBudget(commonNarrative);
  }
  // 检测「老李」「电梯」「昨晚」→ npcDialogueNarrative（覆盖 npc_dialogue）
  if (text.includes("老李") || text.includes("电梯") || text.includes("昨晚")) {
    return ensureCleanNarrativeBudget(npcDialogueNarrative);
  }
  if (text.includes("原石") && text.includes("能量")) {
    return ensureCleanNarrativeBudget(originiumNarrative);
  }
  if (text.includes("档案") && text.includes("失踪")) {
    return ensureCleanNarrativeBudget(taskCompleteNarrative);
  }
  return ensureCleanNarrativeBudget(normalNarrative);
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

export function buildMockCompletionScenario(input: MockScenarioInput): MockCompletionScenario {
  const scenario = resolveMockScenario(input);
  const usage = { promptTokens: 320, completionTokens: 90, totalTokens: 410, cachedPromptTokens: 120 };
  if (input.task === "PLAYER_CONTROL_PREFLIGHT") {
    return { scenario, content: controlPreflightJson(), usage };
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
  if (input.task === "MECHANICS") {
    // Mechanics Workflow mock: returns a valid narrative response
    const mechanicsNarrative = "\u6211\u73af\u987e\u56db\u5468\uff0c\u8d70\u5eca\u91cc\u7684\u706f\u5149\u5ffd\u660e\u5ffd\u6697\u3002\u8001\u5218\u4ece\u914d\u7535\u95f4\u63a2\u51fa\u5934\u6765\uff0c\u671d\u6211\u70b9\u4e86\u70b9\u5934\u3002\u201c\u6765\u5f97\u6b63\u597d\uff0c\u953b\u9020\u53f0\u521a\u68c0\u4fee\u5b8c\u3002\u201d\u4ed6\u6307\u4e86\u6307\u5899\u89d2\u90a3\u53f0\u5621\u5621\u4f5c\u54cd\u7684\u8bbe\u5907\u3002\u6211\u8d70\u8fd1\u953b\u9020\u53f0\uff0c\u91d1\u5c5e\u8868\u9762\u5fae\u5fae\u53d1\u70eb\uff0c\u4e0a\u9762\u523b\u7740\u5bc6\u5bc6\u9ebb\u9ebb\u7684\u7b26\u6587\u3002\u201c\u60f3\u6253\u70b9\u4ec0\u4e48\uff1f\u201d\u8001\u5218\u95ee\u3002\u6211\u68c0\u67e5\u4e86\u4e00\u4e0b\u80cc\u5305\u91cc\u7684\u6750\u6599\u2014\u2014\u9668\u94c1\u7684\u788e\u7247\u5728\u706f\u5149\u4e0b\u6cdb\u7740\u5e7d\u84dd\u7684\u5149\uff0c\u72fc\u738b\u7684\u7259\u9f7f\u8fd8\u5e26\u7740\u5fae\u5fae\u7684\u5bd2\u610f\u3002\u201c\u4e00\u628a\u5251\uff0c\u201d\u6211\u8bf4\uff0c\u201c\u5bf9\u4ea1\u7075\u6709\u6548\u7684\u90a3\u79cd\u3002\u201d";
    return {
      scenario: "normal_stream",
      content: mechanicsNarrative,
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
