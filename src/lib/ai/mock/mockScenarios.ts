import type { ChatMessage } from "@/lib/ai/types/core";
import type { MockAiScenario, MockCompletionScenario, MockScenarioInput, MockStreamScenario } from "@/lib/ai/mock/types";

const MOCK_SCENARIOS = new Set<MockAiScenario>([
  "normal_stream",
  "missing_options",
  "malformed_json",
  "empty_stream",
  "disconnect_before_final",
  "slow_first_token",
  "long_chunk_gap",
  "options_only_valid",
  "options_only_invalid",
]);

function asScenario(value: unknown): MockAiScenario | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as MockAiScenario;
  return MOCK_SCENARIOS.has(normalized) ? normalized : null;
}

function messagesText(messages: ChatMessage[]): string {
  return messages.map((m) => m.content).join("\n").slice(-12_000);
}

function latestUserText(messages: ChatMessage[]): string {
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

// 三条 name-clean 叙事：1st-person、≥180 字、通过 validateNarrativePersonNames。
// normalNarrative 含「走廊」，覆盖 mustContainAny 中含「走廊」的全部 case；
// originiumNarrative 含「原石/能量/理智/恢复」，taskCompleteNarrative 含「档案/失踪/线索/完成」。
const normalNarrative = [
  "我贴着墙根停下脚步，走廊尽头那根灯管闪了两下。不是普通的闪烁——是有规律的，三短一长，像有人在用光发信号。也就是说，对面也知道我在。动静不是巧合。",
  "门缝里传来一阵被压低的刮擦声，不是风，是有人或什么东西用指节慢慢划过旧漆的声音。我忽然想到走廊公告栏上那张泛黄的提醒：晚十点后请保持安静，并非所有敲门的都是邻居。",
  "我把呼吸放轻，回头看了一下来路。没有脚步，没有光，什么都没有。但我知道自己已经被注意到了——走廊那头的东西停了一个拍子，像在等我决定下一步。",
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

function chooseNarrative(input: MockScenarioInput): string {
  const userText = latestUserText(input.messages);
  const text = `${userText}\n${messagesText(input.messages)}`;
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

function buildDmJson(options: string[], input: MockScenarioInput): string {
  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: chooseNarrative(input),
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
      chunks: chunkText(buildDmJson(MOCK_ACTION_OPTIONS, input).slice(0, 180), 72),
      includeDone: false,
      usage,
    };
  }
  const options = scenario === "missing_options" ? [] : MOCK_ACTION_OPTIONS;
  return { scenario, chunks: chunkText(buildDmJson(options, input)), includeDone: true, usage };
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

function narrativeExpansionJson(input: MockScenarioInput): string {
  // 与主 PLAYER_CHAT 同路由：保证 final hook 的 narrative 覆盖与主叙事一致（no-op），
  // 避免 originium/taskComplete 等专题叙事被默认叙事覆盖。
  return JSON.stringify({ narrative: chooseNarrative(input) });
}

export function buildMockCompletionScenario(input: MockScenarioInput): MockCompletionScenario {
  const scenario = resolveMockScenario(input);
  const usage = { promptTokens: 320, completionTokens: 90, totalTokens: 410, cachedPromptTokens: 120 };
  if (input.task === "PLAYER_CONTROL_PREFLIGHT") {
    return { scenario, content: controlPreflightJson(), usage };
  }
  if (input.task === "NARRATIVE_EXPANSION") {
    return { scenario, content: narrativeExpansionJson(input), usage };
  }
  if (scenario === "options_only_invalid") {
    return {
      scenario,
      content: JSON.stringify({
        options: ["查看背包", "查看背包", "打开菜单", "查看属性"],
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
