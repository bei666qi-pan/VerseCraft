import { isNonNarrativeOptionLike, isOverGenericNarrativeOption } from "@/lib/play/optionQuality";
import { buildOptionSemanticFingerprint, isHighSimilarOptionAction } from "@/lib/play/optionsSemanticFingerprint";

export type OptionSemanticCategory =
  | "investigate"
  | "interact"
  | "move"
  | "tool_use"
  | "social"
  | "risk_probe";

export type OptionRejectReason =
  | "empty"
  | "non_narrative"
  | "duplicate_current_recent"
  | "high_similarity_duplicate"
  | "generic_action"
  | "missing_story_anchor"
  | "homogeneity_rejected";

export interface OptionSemanticGuardInput {
  options: string[];
  currentOptions: string[];
  recentOptions: string[];
  latestNarrative: string;
  playerLocation?: string;
}

export interface OptionSemanticGuardResult {
  accepted: string[];
  rejected: Array<{ option: string; reason: OptionRejectReason }>;
  categoryCounts: Record<OptionSemanticCategory, number>;
  anchoredCount: number;
}

const MAX_RESULT = 4;
const CATEGORY_CAP_WHEN_HOMOGENEOUS = 2;

const ANCHOR_HINT_WORDS = [
  "门缝",
  "房门",
  "走廊",
  "楼道",
  "楼梯",
  "窗",
  "墙角",
  "阴影",
  "脚步",
  "动静",
  "钥匙",
  "手电",
  "血迹",
  "广播",
  "铃声",
  "电梯",
  "寝室",
  "档案室",
  "仓库",
  "巡逻",
  "规则",
];

const STOP_TOKENS = new Set([
  "然后",
  "因为",
  "这个",
  "那个",
  "我们",
  "你们",
  "他们",
  "现在",
  "已经",
  "还是",
  "继续",
  "可以",
  "可能",
]);

function normalizeText(text: string): string {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：“”"'、,.!?;:()（）【】\[\]《》<>]/g, "");
}

function isGenericAction(option: string): boolean {
  const t = normalizeText(option);
  if (!t) return true;
  return isOverGenericNarrativeOption(t);
}

function extractNarrativeAnchors(latestNarrative: string, playerLocation?: string): string[] {
  const text = String(latestNarrative ?? "");
  const anchors = new Set<string>();
  for (const word of ANCHOR_HINT_WORDS) {
    if (text.includes(word)) anchors.add(word);
  }
  if (playerLocation && playerLocation.trim()) anchors.add(playerLocation.trim());
  const chunks = text.match(/[\u4e00-\u9fa5]{2,6}/g) ?? [];
  for (const token of chunks) {
    if (anchors.size >= 20) break;
    if (STOP_TOKENS.has(token)) continue;
    if (token.length < 2) continue;
    anchors.add(token);
  }
  return Array.from(anchors).slice(0, 20);
}

function isAnchoredToNarrative(option: string, anchors: string[]): boolean {
  const t = normalizeText(option);
  if (!t) return false;
  return anchors.some((a) => a.length >= 2 && t.includes(normalizeText(a)));
}

function classifyOptionCategory(option: string): OptionSemanticCategory {
  const t = normalizeText(option);
  if (/(询问|打听|追问|套话|对话|交流)/.test(t)) return "social";
  if (/(手电|钥匙|铁丝|镜子|手机|绳|撬|照|点燃|拿出|使用)/.test(t)) return "tool_use";
  if (/(试探|诱饵|冒险|硬闯|赌|引开|触发)/.test(t)) return "risk_probe";
  if (/(前往|走向|靠近|移动|返回|撤到|进入|绕到)/.test(t)) return "move";
  if (/(敲|推|拉|撬|触碰|堵住|搬开|开门)/.test(t)) return "interact";
  return "investigate";
}

function initCategoryCounts(): Record<OptionSemanticCategory, number> {
  return {
    investigate: 0,
    interact: 0,
    move: 0,
    tool_use: 0,
    social: 0,
    risk_probe: 0,
  };
}

function isOverHomogeneous(nextCategory: OptionSemanticCategory, counts: Record<OptionSemanticCategory, number>): boolean {
  const projected = { ...counts, [nextCategory]: counts[nextCategory] + 1 };
  const total = Object.values(projected).reduce((sum, n) => sum + n, 0);
  const dominant = Math.max(...Object.values(projected));
  return total >= 3 && dominant > CATEGORY_CAP_WHEN_HOMOGENEOUS;
}

export function evaluateOptionsSemanticQuality(input: OptionSemanticGuardInput): OptionSemanticGuardResult {
  const source = Array.isArray(input.options) ? input.options : [];
  const current = (Array.isArray(input.currentOptions) ? input.currentOptions : []).map((x) => String(x ?? "").trim());
  const recent = (Array.isArray(input.recentOptions) ? input.recentOptions : []).map((x) => String(x ?? "").trim());
  const anchors = extractNarrativeAnchors(input.latestNarrative, input.playerLocation);
  const rejected: Array<{ option: string; reason: OptionRejectReason }> = [];
  const accepted: string[] = [];
  const categoryCounts = initCategoryCounts();
  const blockedByHistory = [...current, ...recent];
  const historyFingerprints = blockedByHistory.map((x) => buildOptionSemanticFingerprint(x));

  const staged: Array<{ option: string; category: OptionSemanticCategory; anchored: boolean }> = [];
  for (const raw of source) {
    const option = String(raw ?? "").trim();
    if (!option) {
      rejected.push({ option, reason: "empty" });
      continue;
    }
    if (isNonNarrativeOptionLike(option)) {
      rejected.push({ option, reason: "non_narrative" });
      continue;
    }
    if (blockedByHistory.includes(option)) {
      rejected.push({ option, reason: "duplicate_current_recent" });
      continue;
    }
    if (blockedByHistory.some((h) => isHighSimilarOptionAction(option, h))) {
      rejected.push({ option, reason: "high_similarity_duplicate" });
      continue;
    }
    const fp = buildOptionSemanticFingerprint(option);
    const historyTargetReuse = historyFingerprints.some((hfp) => {
      const sameTarget = fp.targetTokens.some((t) => hfp.targetTokens.includes(t));
      if (!sameTarget) return false;
      const probeLikeA = fp.actionFamily === "probe" || fp.actionFamily === "interact";
      const probeLikeB = hfp.actionFamily === "probe" || hfp.actionFamily === "interact";
      return probeLikeA && probeLikeB;
    });
    if (historyTargetReuse) {
      rejected.push({ option, reason: "high_similarity_duplicate" });
      continue;
    }
    if (staged.some((x) => isHighSimilarOptionAction(option, x.option))) {
      rejected.push({ option, reason: "high_similarity_duplicate" });
      continue;
    }
    if (isGenericAction(option)) {
      rejected.push({ option, reason: "generic_action" });
      continue;
    }
    const anchored = isAnchoredToNarrative(option, anchors);
    if (!anchored) {
      rejected.push({ option, reason: "missing_story_anchor" });
      continue;
    }
    staged.push({ option, category: classifyOptionCategory(option), anchored });
  }

  // 先按多样性放行，再控制同质化
  for (const row of staged) {
    if (accepted.length >= MAX_RESULT) break;
    if (isOverHomogeneous(row.category, categoryCounts)) {
      rejected.push({ option: row.option, reason: "homogeneity_rejected" });
      continue;
    }
    accepted.push(row.option);
    categoryCounts[row.category] += 1;
  }

  return {
    accepted,
    rejected,
    categoryCounts,
    anchoredCount: accepted.length,
  };
}

