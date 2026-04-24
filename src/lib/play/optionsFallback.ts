import { isNonNarrativeOptionLike, isOverGenericNarrativeOption } from "@/lib/play/optionQuality";
import { isHighSimilarOptionAction } from "@/lib/play/optionsSemanticFingerprint";

export interface OptionsDeterministicFallbackInput {
  latestNarrative: string;
  playerLocation?: string;
  activeTaskSummaries?: string[];
  inventoryHints?: string[];
  blockedOptions: string[];
  existingOptions: string[];
  needCount: number;
}

const SCENE_TOKENS = [
  "门",
  "锁",
  "门缝",
  "走廊",
  "楼梯",
  "脚步",
  "血迹",
  "阴影",
  "窗",
  "电梯",
  "广播",
  "铃声",
  "墙角",
];

const NPC_PATTERN = /(?:老刘|麟泽|保安|管理员|住户|同学|巡逻员)/g;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function extractSceneAnchors(narrative: string, playerLocation?: string): string[] {
  const text = String(narrative ?? "");
  const out: string[] = [];
  for (const token of SCENE_TOKENS) {
    if (text.includes(token)) out.push(token);
  }
  const npcMatches = text.match(NPC_PATTERN) ?? [];
  out.push(...npcMatches);
  if (playerLocation && playerLocation.trim()) out.push(playerLocation.trim());
  return uniq(out).slice(0, 6);
}

function buildSceneTemplateCandidates(anchors: string[], inventoryHints: string[]): string[] {
  const primary = anchors[0] ?? "走廊";
  const secondary = anchors[1] ?? "门缝";
  const inv = inventoryHints[0] ?? "";
  const toolLine = inv ? `我用${inv}试探${primary}的反应` : `我贴近${primary}听清里面动静`;
  return [
    `我沿着${primary}边缘慢慢排查异常`,
    `我先确认${secondary}附近是否有新痕迹`,
    toolLine,
    `我绕到${primary}侧面寻找安全观察位`,
  ];
}

function buildNpcTemplateCandidates(anchors: string[], taskHints: string[]): string[] {
  const npc = anchors.find((x) => /老刘|麟泽|保安|管理员|住户|同学|巡逻员/.test(x)) ?? "附近住户";
  const task = taskHints[0] ?? "当前线索";
  return [
    `我压低声音向${npc}核对${task}`,
    `我追问${npc}刚才异常声源的位置`,
    `我请${npc}描述最近一次风险出现时间`,
    `我和${npc}约定一条紧急撤离路线`,
  ];
}

function buildRiskTemplateCandidates(anchors: string[]): string[] {
  const near = anchors[0] ?? "走廊";
  const far = anchors[1] ?? "楼梯口";
  return [
    `我贴墙靠近${near}判断风险距离`,
    `我先在${far}布置一条撤退路径`,
    `我用短促敲击试探${near}是否有回声`,
    `我停在${near}盲区观察潜在动向`,
  ];
}

function isAllowed(option: string, blocked: string[], accepted: string[]): boolean {
  const t = String(option ?? "").trim();
  if (!t) return false;
  if (isNonNarrativeOptionLike(t)) return false;
  if (isOverGenericNarrativeOption(t)) return false;
  if (blocked.includes(t) || accepted.includes(t)) return false;
  if (blocked.some((x) => isHighSimilarOptionAction(t, x))) return false;
  if (accepted.some((x) => isHighSimilarOptionAction(t, x))) return false;
  return true;
}

export function generateDeterministicFallbackOptions(input: OptionsDeterministicFallbackInput): string[] {
  const needCount = Math.max(0, Math.min(4, Math.trunc(Number(input.needCount ?? 0))));
  if (needCount <= 0) return [];
  const blocked = (Array.isArray(input.blockedOptions) ? input.blockedOptions : [])
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);
  const accepted = (Array.isArray(input.existingOptions) ? input.existingOptions : [])
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);
  const anchors = extractSceneAnchors(input.latestNarrative, input.playerLocation);
  const inventoryHints = (Array.isArray(input.inventoryHints) ? input.inventoryHints : [])
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0)
    .slice(0, 3);
  const taskHints = (Array.isArray(input.activeTaskSummaries) ? input.activeTaskSummaries : [])
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0)
    .slice(0, 3);

  const pool = [
    ...buildSceneTemplateCandidates(anchors, inventoryHints),
    ...buildNpcTemplateCandidates(anchors, taskHints),
    ...buildRiskTemplateCandidates(anchors),
  ];

  const out: string[] = [];
  for (const candidate of pool) {
    if (out.length >= needCount) break;
    if (!isAllowed(candidate, blocked, [...accepted, ...out])) continue;
    out.push(candidate);
  }
  return out;
}

