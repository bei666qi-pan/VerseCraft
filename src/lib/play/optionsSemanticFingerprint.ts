type OptionActionKind =
  | "observe"
  | "listen"
  | "move"
  | "use"
  | "talk"
  | "search"
  | "wait"
  | "other";

interface OptionFingerprint {
  normalized: string;
  action: OptionActionKind;
  actionFamily: "probe" | "move" | "interact" | "wait" | "other";
  targetTokens: string[];
  methodTokens: string[];
  key: string;
}

const TARGET_LEXICON = [
  "门缝",
  "房门",
  "门口",
  "走廊",
  "楼道",
  "楼梯",
  "电梯",
  "窗户",
  "墙角",
  "阴影",
  "声音",
  "动静",
  "脚步",
  "抽屉",
  "柜子",
  "背包",
  "地面",
  "天花板",
  "尽头",
];

const METHOD_LEXICON = [
  "贴近",
  "悄悄",
  "慢慢",
  "快速",
  "手电",
  "手机",
  "耳朵",
  "倾听",
  "试探",
  "敲",
  "照",
  "绕开",
];

const cleanOptionText = (text: string): string =>
  String(text ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^[我先再去要想试着尝试]/g, "")
    .replace(/[，。！？；：“”"'、,.!?;:()（）【】\[\]《》<>]/g, "");

function inferAction(normalized: string): OptionActionKind {
  if (/(观察|查看|检查|打量|审视)/.test(normalized)) return "observe";
  if (/(听|倾听|侧耳|辨认声音|听动静)/.test(normalized)) return "listen";
  if (/(前往|去|走向|靠近|移动|进入|返回|回到)/.test(normalized)) return "move";
  if (/(使用|点燃|照|敲|推|拉|撬|触碰|试探)/.test(normalized)) return "use";
  if (/(询问|打听|追问|对话|交流)/.test(normalized)) return "talk";
  if (/(搜索|翻找|排查|搜查)/.test(normalized)) return "search";
  if (/(等待|停下|观望)/.test(normalized)) return "wait";
  return "other";
}

function actionFamily(action: OptionActionKind): OptionFingerprint["actionFamily"] {
  if (action === "observe" || action === "listen" || action === "search") return "probe";
  if (action === "move") return "move";
  if (action === "use" || action === "talk") return "interact";
  if (action === "wait") return "wait";
  return "other";
}

function pickTokens(source: string, lexicon: string[]): string[] {
  return lexicon.filter((token) => source.includes(token)).slice(0, 3);
}

function fallbackTargetToken(normalized: string): string[] {
  const stripped = normalized
    .replace(/(观察|查看|检查|打量|审视|听|倾听|侧耳|前往|去|走向|靠近|移动|进入|返回|回到|使用|照|敲|试探|询问|打听|搜索|翻找|等待|停下|观望)/g, "")
    .replace(/(贴近|悄悄|慢慢|快速|手电|手机|耳朵|倾听|试探|绕开)/g, "");
  if (stripped.length < 2) return [];
  return [stripped.slice(0, Math.min(4, stripped.length))];
}

export function buildOptionSemanticFingerprint(text: string): OptionFingerprint {
  const normalized = cleanOptionText(text);
  const action = inferAction(normalized);
  const targets = pickTokens(normalized, TARGET_LEXICON);
  const methods = pickTokens(normalized, METHOD_LEXICON);
  const targetTokens = targets.length > 0 ? targets : fallbackTargetToken(normalized);
  const family = actionFamily(action);
  const key = `${family}|${targetTokens.join("&")}|${methods.join("&")}`;
  return {
    normalized,
    action,
    actionFamily: family,
    targetTokens,
    methodTokens: methods,
    key,
  };
}

export function isHighSimilarOptionAction(a: string, b: string): boolean {
  const fa = buildOptionSemanticFingerprint(a);
  const fb = buildOptionSemanticFingerprint(b);
  if (!fa.normalized || !fb.normalized) return false;
  if (fa.normalized === fb.normalized) return true;

  const sameTarget =
    fa.targetTokens.some((t) => fb.targetTokens.includes(t)) ||
    fa.targetTokens.some((t) => t.length >= 2 && fb.normalized.includes(t)) ||
    fb.targetTokens.some((t) => t.length >= 2 && fa.normalized.includes(t));
  if (!sameTarget) return false;

  if (fa.actionFamily === fb.actionFamily) return true;
  if (
    (fa.actionFamily === "probe" && fb.actionFamily === "move") ||
    (fa.actionFamily === "move" && fb.actionFamily === "probe")
  ) {
    // 同一目标上的“靠近 + 侦察”视为高相似，避免换皮回填。
    return true;
  }
  return false;
}

