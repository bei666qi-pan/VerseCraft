export type PlayGuideCard = {
  title: string;
  bullets: readonly string[];
};

export type PlayGuideSection = {
  id: string;
  title: string;
  body?: string;
  bullets?: readonly string[];
  cards?: readonly PlayGuideCard[];
  narrativeHint: string;
  aliases: readonly string[];
  framed?: boolean;
};

export const PLAY_GUIDE_SECTIONS: readonly PlayGuideSection[] = [
  {
    id: "quickstart",
    title: "30 秒快速上手",
    bullets: [
      "每回合你只做一件事：选一个行动，让故事继续。",
      "新手优先用选项模式推进；有明确想法再切手动输入。",
      "遇到风险时先看信息（地点 / 时间 / 任务 / 图鉴 / 背包），再决定要不要冒险。",
    ],
    narrativeHint: "每回合先明确一件行动，让故事继续；遇到风险时先读现场信息，再决定是否冒险。",
    aliases: ["quickstart", "start", "intro", "beginner", "new_player", "新手", "上手", "快速"],
    framed: true,
  },
  {
    id: "turn-loop",
    title: "1）这游戏怎么玩",
    body: "核心循环很简单：每回合选择一个行动 → 主笔给出剧情反馈 → 局势变化 → 进入下一回合。",
    cards: [
      {
        title: "选项模式",
        bullets: ["适合：刚入门、没思路、想稳稳推进。", "优点：不容易做出无效操作，节奏更清晰。"],
      },
      {
        title: "手动输入",
        bullets: ["适合：你有明确策略、想做更细的动作。", "建议：一句话即可，越具体越好。"],
      },
    ],
    narrativeHint: "先明确本回合唯一行动，等待主笔反馈局势变化，再进入下一回合。",
    aliases: ["turn", "loop", "action", "choice", "howto", "玩法", "回合", "行动", "选项", "输入"],
  },
  {
    id: "summary",
    title: "一句话总结",
    body: "文界工坊的核心不是乱冲，而是读信息 → 做判断 → 再行动。",
    narrativeHint: "读信息、做判断、再行动。",
    aliases: ["summary", "rule", "risk", "判断", "总结", "风险"],
    framed: true,
  },
];

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function cleanText(raw: unknown, max = 120): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function extractGuideSelector(raw: unknown): string {
  const o = asRecord(raw);
  if (!o) return "";
  return (
    cleanText(o.guide_topic) ||
    cleanText(o.guideTopic) ||
    cleanText(o.topic) ||
    cleanText(o.guide_id) ||
    cleanText(o.guideId) ||
    cleanText(o.hint_key) ||
    cleanText(o.hintKey) ||
    cleanText(o.query)
  ).toLowerCase();
}

export function selectNarrativeGuideFragment(raw: unknown): string {
  const selector = extractGuideSelector(raw);
  if (!selector) return "";

  const exact = PLAY_GUIDE_SECTIONS.find(
    (section) =>
      section.id.toLowerCase() === selector ||
      section.title.toLowerCase() === selector ||
      section.aliases.some((alias) => alias.toLowerCase() === selector)
  );
  if (exact) return exact.narrativeHint;

  const fuzzy = PLAY_GUIDE_SECTIONS.find((section) => {
    const haystack = [section.id, section.title, ...section.aliases].join(" ").toLowerCase();
    return haystack.includes(selector) || selector.includes(section.id.toLowerCase());
  });
  return fuzzy?.narrativeHint ?? "";
}
