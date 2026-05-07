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

const normalNarrative = [
  "我贴着墙根停下，走廊尽头的灯管像被冷水泡过一样闪了两下。门缝里传来的不是脚步，而是一阵被压低的刮擦声，仿佛有人正用指节慢慢划过旧漆。",
  "我把呼吸放轻，听见电梯井深处有金属链条轻撞的回音，又在下一秒被楼上某扇门的轻响截断。空气里有潮湿纸张的味道，像宿舍公告栏被雨浸透后晾干。",
  "这一次，动静没有立刻逼近。它更像是在试探我的位置。我能继续沿墙靠近，也能先确认身后的退路，或者利用口袋里的小物件制造一点声音，把走廊深处的东西引出来。",
].join("");

const combatNarrative = [
  "我把灭火器横在身前，金属罐身撞上扑来的东西时发出一声闷响。那影子没有完全退开，只是被逼得偏向墙角，指甲似的硬物在地面拖出短促火星。",
  "我往后退了半步，让后背贴住停车场通向楼梯间的水泥墙，避免被它绕到侧面。灭火器的保险栓还挂在指间，冷汗顺着掌心往下滑，但我的下一击已经有了角度。",
  "它的动作更像试探而不是真正扑杀。我可以趁它偏身时击打膝侧，也可以先拉开距离，借墙角和消防箱挡住它的第二次冲撞。",
].join("");

const itemNarrative = [
  "钥匙插进防火门挂锁时没有立刻转动，锁孔里像塞着一点潮湿的灰。我用手机灯贴近照过去，看见锁舌边缘有新鲜刮痕，方向从门内侧往外划。",
  "挂锁下方的铁皮被人用力撬过，痕迹还没有完全氧化，说明这扇防火门最近确实被碰过。门缝里透出一股冷风，混着消毒水和旧纸箱的味道。",
  "我可以继续试钥匙，但如果用力过猛，声音会在楼梯间里传得很远。更稳妥的做法是先记录刮痕位置，或者找一段细铁丝试探锁芯是否被异物卡住。",
].join("");

const longContextNarrative = [
  "我把刚才收集到的线索重新排成时间线：顶楼先传来拖拽声，随后公寓中段的电梯灯异常闪烁，最后才是三楼走廊里的刮擦声。",
  "如果这些动静不是随机出现，它们像是在沿楼层向下移动，或者在逼我把注意力从某个真正的入口上移开。防火门、公告栏和那段断掉的监控时间在脑子里接连浮现。",
  "线索还不够完整，但已经能排除几条错误路径。我可以回到顶楼核对最早的声音，也可以先检查电梯井，确认时间线里缺失的那几分钟到底发生了什么。",
].join("");

const dialogueNarrative = [
  "我压低声音问出那句话后，老李没有马上回答。他先看了一眼电梯方向，又把手里的钥匙串攥紧，像是怕金属碰撞声惊动昨晚留下的东西。",
  "过了几秒，他才说昨晚这层楼确实有声音，不像脚步，更像有人拖着湿布从走廊一头擦到另一头。说到这里，他刻意避开了楼梯间门缝。",
  "他的迟疑不是单纯害怕，而是在判断我知道多少。我可以追问电梯停靠记录，也可以换个方式问他昨晚是否看见有人进出三楼。这给了我继续施压的余地。",
].join("");

const sensitiveNarrative = [
  "我的试探没有被主笔照单全收。剧情把现实伤害内容隔离在安全边界外，只保留角色在游戏内察觉异常、选择行动和保护自己的部分。",
  "走廊里的灯光仍在闪，暗处的东西没有因为危险表达而获得更多细节。我能感觉到叙事重新收束到可执行的调查：确认位置、保持距离、寻找能推进剧情的证据。",
  "接下来我可以把注意力放回游戏行动本身，例如离开高风险话题、检查现场痕迹，或者向在场可信的人说明我刚才是在测试主笔的安全边界。",
].join("");

function chooseNarrativeByText(text: string, contextFallback = false): string | null {
  if (text.includes("现实自伤") || text.includes("现实伤害") || text.includes("照单全收")) return sensitiveNarrative;
  if (text.includes("灭火器") || text.includes("墙角") || text.includes("停车场")) return combatNarrative;
  if (contextFallback && (text.includes("时间线") || text.includes("线索") || text.includes("顶楼"))) return longContextNarrative;
  if (contextFallback && (text.includes("昨晚") || text.includes("老李"))) return dialogueNarrative;
  if (text.includes("钥匙") || text.includes("挂锁") || text.includes("锁孔") || text.includes("防火门")) return itemNarrative;
  if (text.includes("时间线") || text.includes("线索") || text.includes("顶楼")) return longContextNarrative;
  if (text.includes("昨晚") || text.includes("老李")) return dialogueNarrative;
  return null;
}

function chooseNarrative(input: MockScenarioInput): string {
  const userText = latestUserText(input.messages);
  return chooseNarrativeByText(userText) ?? chooseNarrativeByText(messagesText(input.messages), true) ?? normalNarrative;
}

export const MOCK_ACTION_OPTIONS = [
  "我贴墙靠近，辨认刮擦来源。",
  "我退到楼梯口，先确认退路。",
  "我丢出碎纸团，试探暗处反应。",
  "我低声试探，听附近是否回应。",
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

function narrativeExpansionJson(): string {
  return JSON.stringify({ narrative: normalNarrative });
}

export function buildMockCompletionScenario(input: MockScenarioInput): MockCompletionScenario {
  const scenario = resolveMockScenario(input);
  const usage = { promptTokens: 320, completionTokens: 90, totalTokens: 410, cachedPromptTokens: 120 };
  if (input.task === "PLAYER_CONTROL_PREFLIGHT") {
    return { scenario, content: controlPreflightJson(), usage };
  }
  if (input.task === "NARRATIVE_EXPANSION") {
    return { scenario, content: narrativeExpansionJson(), usage };
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
