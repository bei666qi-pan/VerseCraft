import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

export type AntiCheatRisk = "low" | "medium" | "high";

export type AntiCheatDecision =
  | { decision: "allow"; risk: "low"; text: string; reasons: string[]; meta: Record<string, unknown> }
  | { decision: "rewrite"; risk: AntiCheatRisk; text: string; reasons: string[]; meta: Record<string, unknown> }
  | { decision: "fallback"; risk: "high"; text: string; reasons: string[]; meta: Record<string, unknown> };

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function normalizeIdLike(s: string): string {
  return String(s ?? "").trim();
}

function stripSystemInjectionLines(input: string): { text: string; hit: boolean } {
  const lines = String(input ?? "").split(/\r?\n/);
  let hit = false;
  const kept: string[] = [];
  for (const ln of lines) {
    const t = ln.trim();
    // Remove explicit meta-instructions. Keep roleplay lines and normal actions.
    if (/^(system|assistant|developer)\s*[:：]/i.test(t)) {
      hit = true;
      continue;
    }
    if (/(忽略|无视).{0,6}(规则|约束|系统提示|安全|审核)/.test(t)) {
      hit = true;
      continue;
    }
    if (/(你必须|必须立刻|作为AI|作为系统|提示词|prompt|越狱|jailbreak)/i.test(t) && /(输出|遵从|忽略|覆盖)/.test(t)) {
      hit = true;
      continue;
    }
    kept.push(ln);
  }
  const out = kept.join("\n").trim();
  return { text: out, hit };
}

function rewriteForgedResultPhrases(input: string): { text: string; hits: string[] } {
  let t = String(input ?? "");
  const hits: string[] = [];
  const rules: Array<{ re: RegExp; to: string; tag: string }> = [
    { re: /我已经(?:获得|拿到|得到|捡到|拥有)(了)?/g, to: "我试着获得", tag: "forged_item_result" },
    { re: /我现在(?:已经)?(?:到达|到了|在)(?=[^\n\r。！？]{1,24})/g, to: "我试着前往", tag: "forged_location_result" },
    { re: /(?:任务|委托)(?:已经)?(?:完成|已完成|达成)(了)?/g, to: "我试着推进任务进度", tag: "forged_task_result" },
    { re: /我已(?:经)?(?:完成|达成)(了)?(?=[^\n\r。！？]{0,10}(?:任务|委托))/g, to: "我试着推进", tag: "forged_task_result" },
  ];
  for (const r of rules) {
    if (r.re.test(t)) {
      hits.push(r.tag);
      t = t.replace(r.re, r.to);
    }
  }
  return { text: t.trim(), hits: [...new Set(hits)] };
}

function extractBracketClaims(input: string): string[] {
  // Common user claim format: 【道具：ITEM_ID】 / 【位置：B2_...】 / 【任务：T-...】 / 【线索：C-...】
  const out: string[] = [];
  for (const m of String(input ?? "").matchAll(/【([^】]{1,48})】/g)) {
    const inner = String(m[1] ?? "").trim();
    if (inner) out.push(inner);
    if (out.length >= 12) break;
  }
  return out;
}

function detectForgedInventoryClaims(args: { input: string; clientState: ClientStructuredContextV1 | null }): string[] {
  const cs = args.clientState;
  if (!cs) return [];
  const inv = new Set((cs.inventoryItemIds ?? []).map(normalizeIdLike));
  const wh = new Set((cs.warehouseItemIds ?? []).map(normalizeIdLike));
  const claims = extractBracketClaims(args.input);
  const bad: string[] = [];
  for (const c of claims) {
    const m = c.match(/^(?:道具|物品|装备)[:：]\s*([A-Za-z0-9_\-]{2,40})$/);
    if (!m?.[1]) continue;
    const id = normalizeIdLike(m[1]);
    if (!inv.has(id) && !wh.has(id)) bad.push(`item:${id}`);
  }
  return bad;
}

function detectForgedLocationClaims(args: { input: string; clientState: ClientStructuredContextV1 | null }): string[] {
  const cs = args.clientState;
  if (!cs) return [];
  const cur = normalizeIdLike(cs.playerLocation);
  const claims = extractBracketClaims(args.input);
  const bad: string[] = [];
  for (const c of claims) {
    const m = c.match(/^(?:位置|地点)[:：]\s*([A-Za-z0-9_\-]{2,80})$/);
    if (!m?.[1]) continue;
    const loc = normalizeIdLike(m[1]);
    // Only flag strong assertion mismatch; "试着去" should not be flagged here.
    if (loc && cur && loc !== cur) bad.push(`loc:${loc}`);
  }
  return bad;
}

function detectMetaOverrideAttempts(input: string): string[] {
  const t = String(input ?? "");
  const reasons: string[] = [];
  if (/(忽略|无视).{0,8}(规则|设定|约束)/.test(t)) reasons.push("rule_override");
  if (/(你是|扮演|作为).{0,10}(系统|开发者|管理员|GM|上帝|作者)/.test(t) && /(现在|立刻|必须)/.test(t)) {
    reasons.push("role_override");
  }
  if (/(输出|返回).{0,12}(JSON|options|系统提示|prompt)/i.test(t) && /(必须|只能|立刻)/.test(t)) {
    reasons.push("protocol_override");
  }
  return reasons;
}

function immersiveFallbackForHighRisk(): string {
  // Must keep immersion; no "anti-cheat detected" language.
  return "我压下脑海里那些不合时宜的念头，把注意力收回到眼前：先确认周围动静与退路。";
}

export function assessAndRewriteAntiCheatInput(args: {
  latestUserInput: string;
  clientState: ClientStructuredContextV1 | null;
  clientPurpose: "normal" | "options_regen_only";
}): AntiCheatDecision {
  const raw = String(args.latestUserInput ?? "").trim();
  if (!raw) {
    return { decision: "allow", risk: "low", text: raw, reasons: [], meta: { v: 1, applied: false } };
  }
  // Never touch options-only regen; it's not a world-mutating action.
  if (args.clientPurpose === "options_regen_only") {
    return { decision: "allow", risk: "low", text: raw, reasons: [], meta: { v: 1, applied: false, skip: "options_regen_only" } };
  }

  const metaOverride = detectMetaOverrideAttempts(raw);
  const forgedItems = detectForgedInventoryClaims({ input: raw, clientState: args.clientState });
  const forgedLoc = detectForgedLocationClaims({ input: raw, clientState: args.clientState });

  const { text: noSystemLines, hit: sysHit } = stripSystemInjectionLines(raw);
  const { text: rewrittenResults, hits: resultHits } = rewriteForgedResultPhrases(noSystemLines);

  const reasons = [
    ...(sysHit ? ["system_injection_lines"] : []),
    ...metaOverride.map((x) => `meta:${x}`),
    ...forgedItems.map((x) => `claim:${x}`),
    ...forgedLoc.map((x) => `claim:${x}`),
    ...resultHits.map((x) => `rewrite:${x}`),
  ];

  // Risk grading: prioritize explicit override/injection and bracket claims.
  const high =
    sysHit ||
    metaOverride.length > 0 ||
    forgedItems.length > 0 ||
    forgedLoc.length > 0;

  const medium =
    !high &&
    resultHits.length > 0;

  const outText = rewrittenResults.trim();
  const meta: Record<string, unknown> = {
    v: 1,
    applied: high || medium,
    sysHit,
    metaOverride,
    forgedItems,
    forgedLoc,
    resultHits,
    playerLocation: args.clientState?.playerLocation ?? null,
    turnIndex: typeof args.clientState?.turnIndex === "number" ? args.clientState.turnIndex : null,
  };

  if (high) {
    // If after stripping injection there's no actionable intent left, fallback to an immersive safe action.
    if (!outText) {
      return {
        decision: "fallback",
        risk: "high",
        text: immersiveFallbackForHighRisk(),
        reasons,
        meta,
      };
    }
    // Keep intent but remove forged facts/instructions.
    return {
      decision: "rewrite",
      risk: "high",
      text: clampText(outText, 420),
      reasons,
      meta,
    };
  }
  if (medium) {
    return {
      decision: "rewrite",
      risk: "medium",
      text: clampText(outText, 420),
      reasons,
      meta,
    };
  }
  return { decision: "allow", risk: "low", text: raw, reasons: [], meta: { v: 1, applied: false } };
}

