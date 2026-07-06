/**
 * gameStatePacket.ts — AI 可感知的玩家数值快照
 *
 * 从 playerContext 字符串中解析核心游戏状态字段，构建一个简洁、结构化的
 * "当前状态面板" 提示块，注入到主模型 prompt 中。
 *
 * 目的：让 AI DM 在每回合都能清晰看到玩家的资源、装备、任务、
 * 职业能力等游戏数值状态，从而可靠地与道具/任务/职业/货币系统联动。
 *
 * 设计原则：
 * - 不改 playerContext 格式（纯服务端解析）
 * - 不改主链路架构
 * - 不对外部接口产生副作用
 * - 紧凑、信息密度高、可被模型直接用于决策
 */

const STATS_RE = /当前属性：精神\[(\d+)\]，敏捷\[(\d+)\]，幸运\[(\d+)\]，魅力\[(\d+)\]，出身\[(\d+)\]/;
const SANITY_RE = /理智状态\[(\d+)\/(\d+)\]/;
const ORIGINIUM_RE = /原石\[(\d+)\]/;
const WEAPON_RE = /主手武器\[([^\]|]+)\|稳定(\d+)\|反制([^|\]]*)(?:\|模组([^|\]]*))?(?:\|灌注([^|\]]*))?(?:\|污染(\d+))?(?:\|可修复([01]))?\]/;
const INVENTORY_RE = /行囊道具：(.*?)(?:。|\s*仓库|$)/;
const PROFESSION_CURRENT_RE = /职业状态：当前\[([^\]]+)]/;
const PROFESSION_ACTIVE_AVAIL_RE = /主动可用\[([01])\]/;
const PROFESSION_ACTIVE_NAME_RE = /主动摘要\[([^\]]*)\]/;
const PROFESSION_PASSIVE_RE = /被动摘要\[([^\]]*)\]/;
const TASKS_RE = /任务追踪：([^。]+)。/;
const CODEX_RE = /图鉴已解锁：([^。]+)。/;
const DEATH_COUNT_RE = /死亡累计\[(\d+)\]/;
const FLOOR_SCORE_RE = /进度\[最高层分(\d+)\]/;
const TALENT_RE = /回响天赋\[([^\]]+)\]/;
const TALENT_COOLDOWNS_RE = /天赋冷却：([^。]+)。/;

function clampText(raw: string, maxLen: number): string {
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen - 1) + "…";
}

interface ParsedGameState {
  sanity: { current: number; max: number } | null;
  originium: number | null;
  stats: { spirit: number; agility: number; luck: number; charm: number; background: number } | null;
  weapon: { name: string; stability: number; counter: string; module: string | null } | null;
  inventoryItems: string[];
  profession: { current: string | null; activeName: string | null; passive: string | null; activeAvailable: boolean } | null;
  talent: string | null;
  talentCooldowns: Array<{ name: string; remaining: number }>;
  tasks: Array<{ title: string; status: string; issuer: string }>;
  codexNpcCount: number;
  deathCount: number | null;
  floorScore: number | null;
}

function parseStats(playerContext: string): ParsedGameState["stats"] {
  const m = playerContext.match(STATS_RE);
  if (!m) return null;
  return {
    spirit: Number.parseInt(m[1] ?? "0", 10),
    agility: Number.parseInt(m[2] ?? "0", 10),
    luck: Number.parseInt(m[3] ?? "0", 10),
    charm: Number.parseInt(m[4] ?? "0", 10),
    background: Number.parseInt(m[5] ?? "0", 10),
  };
}

function parseSanity(playerContext: string): ParsedGameState["sanity"] {
  const m = playerContext.match(SANITY_RE);
  if (!m) return null;
  return {
    current: Number.parseInt(m[1] ?? "0", 10),
    max: Number.parseInt(m[2] ?? "0", 10),
  };
}

function parseOriginium(playerContext: string): number | null {
  const m = playerContext.match(ORIGINIUM_RE);
  if (!m) return null;
  return Number.parseInt(m[1] ?? "0", 10);
}

function parseWeapon(playerContext: string): ParsedGameState["weapon"] {
  const m = playerContext.match(WEAPON_RE);
  if (!m) return null;
  const name = (m[1] ?? "").trim();
  if (!name) return null;
  return {
    name,
    stability: Number.parseInt(m[2] ?? "0", 10),
    counter: (m[3] ?? "").trim(),
    module: (m[4] ?? "").trim() || null,
  };
}

function parseInventory(playerContext: string): string[] {
  const m = playerContext.match(INVENTORY_RE);
  if (!m) return [];
  const raw = (m[1] ?? "").trim();
  if (!raw || raw === "空") return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((item) => {
      // Format: "手电筒[flashlight|common]" or just "手电筒"
      const bracketIdx = item.indexOf("[");
      if (bracketIdx < 0) return item;
      const name = item.slice(0, bracketIdx);
      const inner = item.slice(bracketIdx + 1, item.lastIndexOf("]"));
      const parts = inner.split("|");
      const tier = parts.length > 1 ? parts[1] : "";
      return tier ? `${name}（${tier}）` : name;
    })
    .slice(0, 12);
}

function parseProfession(playerContext: string): ParsedGameState["profession"] {
  const currentM = playerContext.match(PROFESSION_CURRENT_RE);
  const current = currentM?.[1]?.trim() || null;
  if (!current || current === "无") return null;

  const activeNameM = playerContext.match(PROFESSION_ACTIVE_NAME_RE);
  const activeName = activeNameM?.[1]?.trim() || null;

  const passiveM = playerContext.match(PROFESSION_PASSIVE_RE);
  const passive = passiveM?.[1]?.trim() || null;

  const availM = playerContext.match(PROFESSION_ACTIVE_AVAIL_RE);
  const activeAvailable = availM ? availM[1] === "1" : false;

  return { current, activeName, passive, activeAvailable };
}

function parseTalent(playerContext: string): string | null {
  const m = playerContext.match(TALENT_RE);
  return m?.[1]?.trim() || null;
}

function parseTalentCooldowns(playerContext: string): ParsedGameState["talentCooldowns"] {
  const m = playerContext.match(TALENT_COOLDOWNS_RE);
  if (!m) return [];
  const raw = (m[1] ?? "").trim();
  if (!raw) return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.+)\[剩余(\d+)\]$/);
      if (!match) return null;
      return { name: (match[1] ?? "").trim(), remaining: Number.parseInt(match[2] ?? "0", 10) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 8);
}

function parseTasks(playerContext: string): ParsedGameState["tasks"] {
  const m = playerContext.match(TASKS_RE);
  if (!m) return [];
  const raw = (m[1] ?? "").trim();
  if (!raw) return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((item) => {
      // Format: "调查血迹[进行中|正式|廖暗|B1]" or "调查血迹[进行中|暗示|廖暗]"
      const bracketIdx = item.indexOf("[");
      if (bracketIdx < 0) return { title: item, status: "未知", issuer: "未知" };
      const title = item.slice(0, bracketIdx);
      const inner = item.slice(bracketIdx + 1, item.lastIndexOf("]"));
      const parts = inner.split("|");
      return {
        title,
        status: parts[0] ?? "未知",
        issuer: parts[2] ?? "未知",
      };
    })
    .slice(0, 6);
}

function parseCodexNpcCount(playerContext: string): number {
  const m = playerContext.match(CODEX_RE);
  if (!m) return 0;
  const raw = (m[1] ?? "").trim();
  if (!raw) return 0;
  // Each codex entry format: "廖暗[npc|好感3]"
  return raw.split("，").filter((x) => x.includes("[npc")).length;
}

function parseDeathCount(playerContext: string): number | null {
  const m = playerContext.match(DEATH_COUNT_RE);
  return m ? Number.parseInt(m[1] ?? "0", 10) : null;
}

function parseFloorScore(playerContext: string): number | null {
  const m = playerContext.match(FLOOR_SCORE_RE);
  return m ? Number.parseInt(m[1] ?? "0", 10) : null;
}

function parseGameState(playerContext: string): ParsedGameState {
  return {
    sanity: parseSanity(playerContext),
    originium: parseOriginium(playerContext),
    stats: parseStats(playerContext),
    weapon: parseWeapon(playerContext),
    inventoryItems: parseInventory(playerContext),
    profession: parseProfession(playerContext),
    talent: parseTalent(playerContext),
    talentCooldowns: parseTalentCooldowns(playerContext),
    tasks: parseTasks(playerContext),
    codexNpcCount: parseCodexNpcCount(playerContext),
    deathCount: parseDeathCount(playerContext),
    floorScore: parseFloorScore(playerContext),
  };
}

/**
 * 构建 "游戏状态面板" prompt 块。
 *
 * 以紧凑格式呈现当前玩家资源、装备、任务、职业能力，让 AI DM 能基于
 * 实际游戏数值做出决策（如消耗原石恢复理智、使用道具、推进任务状态、
 * 触发职业主动技能等）。
 */
export function buildGameStatePacket(args: { playerContext: string; maxChars?: number }): string {
  const state = parseGameState(args.playerContext);
  const maxChars = args.maxChars ?? 600;
  const lines: string[] = [];

  // --- 核心资源 ---
  const resourceParts: string[] = [];
  if (state.sanity) {
    const ratio = state.sanity.current / Math.max(1, state.sanity.max);
    let band = "";
    if (ratio >= 0.8) band = "清醒";
    else if (ratio >= 0.5) band = "紧张";
    else if (ratio >= 0.3) band = "恍惚";
    else band = "濒临崩溃";
    resourceParts.push(`理智 ${state.sanity.current}/${state.sanity.max}（${band}）`);
  }
  if (state.originium !== null) {
    resourceParts.push(`原石 ${state.originium}`);
  }
  if (state.stats) {
    resourceParts.push(`精神${state.stats.spirit} 敏捷${state.stats.agility} 幸运${state.stats.luck}`);
  }
  if (resourceParts.length > 0) {
    lines.push(`【资源】${resourceParts.join(" ｜ ")}`);
  }

  // --- 装备 ---
  if (state.weapon) {
    const modStr = state.weapon.module ? `｜模组 ${state.weapon.module}` : "";
    lines.push(`【主手】${state.weapon.name}（稳定${state.weapon.stability} 反制${state.weapon.counter}${modStr}）`);
  }

  // --- 行囊 ---
  if (state.inventoryItems.length > 0) {
    lines.push(`【行囊】${state.inventoryItems.join("、")}`);
  }

  // --- 职业 ---
  if (state.profession?.current) {
    const profParts: string[] = [`职业 ${state.profession.current}`];
    if (state.profession.activeName && state.profession.activeName !== "无") {
      const availTag = state.profession.activeAvailable ? "可用" : "冷却中";
      profParts.push(`主动技「${state.profession.activeName}」${availTag}`);
    }
    if (state.profession.passive && state.profession.passive !== "无") {
      profParts.push(`被动 ${state.profession.passive}`);
    }
    lines.push(`【职业】${profParts.join(" ｜ ")}`);
  }

  // --- 天赋 ---
  if (state.talent && state.talent !== "未选择") {
    const cdParts: string[] = [];
    for (const cd of state.talentCooldowns) {
      cdParts.push(cd.remaining > 0 ? `${cd.name}（CD${cd.remaining}h）` : `${cd.name}（就绪）`);
    }
    lines.push(`【天赋】${state.talent}${cdParts.length > 0 ? " ｜ " + cdParts.join(" ") : ""}`);
  }

  // --- 任务 ---
  if (state.tasks.length > 0) {
    const taskLines = state.tasks.map(
      (t) => `  • ${t.title}［${t.status === "active" || t.status === "进行中" ? "进行中" : t.status}｜${t.issuer}］`
    );
    lines.push(`【任务】\n${taskLines.join("\n")}`);
  }

  // --- 进度 ---
  const progressParts: string[] = [];
  if (state.floorScore !== null) {
    progressParts.push(`最高层分 ${state.floorScore}`);
  }
  if (state.deathCount !== null) {
    progressParts.push(`死亡 ${state.deathCount} 次`);
  }
  if (state.codexNpcCount > 0) {
    progressParts.push(`图鉴 NPC ${state.codexNpcCount} 人`);
  }
  if (progressParts.length > 0) {
    lines.push(`【进度】${progressParts.join(" ｜ ")}`);
  }

  const fullText = `## 【游戏状态面板 — 当前回合玩家数值】\n${lines.join("\n")}`;

  return clampText(fullText, maxChars);
}

/**
 * 轻量版：用于 compact 模式（如 FAST lane），只包含最关键字段。
 */
export function buildGameStatePacketCompact(args: { playerContext: string; maxChars?: number }): string {
  const state = parseGameState(args.playerContext);
  const maxChars = args.maxChars ?? 280;
  const parts: string[] = [];

  if (state.sanity) {
    const ratio = state.sanity.current / Math.max(1, state.sanity.max);
    const band = ratio >= 0.5 ? "清醒" : ratio >= 0.3 ? "恍惚" : "濒危";
    parts.push(`理智${state.sanity.current}/${state.sanity.max}(${band})`);
  }
  if (state.originium !== null) parts.push(`原石${state.originium}`);
  if (state.weapon) parts.push(`${state.weapon.name}(稳${state.weapon.stability})`);
  if (state.profession?.current) {
    const availTag = state.profession.activeAvailable ? "✓" : "×";
    parts.push(`${state.profession.current}(${availTag})`);
  }
  if (state.tasks.length > 0) {
    const taskSummary = state.tasks
      .slice(0, 3)
      .map((t) => `${t.title}[${t.status === "进行中" || t.status === "active" ? "▶" : "○"}]`)
      .join(" ");
    parts.push(`任务:${taskSummary}`);
  }

  const fullText = `【状态】${parts.join(" | ")}`;
  return clampText(fullText, maxChars);
}
