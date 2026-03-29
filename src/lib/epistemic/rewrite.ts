/**
 * 认知泄露后的轻量改写（无二次大模型）：模板化降级 / 子串擦洗。
 */

import type { KnowledgeFact } from "./types";

/** 轻微软化：追加迟疑语气，不把话说死 */
export const EPISTEMIC_SOFT_HEDGE =
  "对方话到一半又顿住，像是没完全接住你的意思，没有把话说死。";

/** 严重越界：改为不确认 + 追问来源（保留前文少量语境） */
export function rewriteNarrativeHeavyLeak(
  narrative: string,
  leakType: "overreach_acceptance" | "private_fact_leak" | "world_truth_premature"
): string {
  const tail =
    leakType === "overreach_acceptance"
      ? "……我没法照你这话接下去。你从哪里听来的？"
      : "……这些事我不该是从你嘴里第一次听说。你先说说，消息哪来的？";
  if (leakType === "overreach_acceptance") {
    const head = narrative.trim().slice(0, Math.min(120, narrative.trim().length));
    return head ? `${head}\n\n${tail}` : tail;
  }
  // 私有/世界真相：禁止复述原文前缀（极易仍含子串命中），只保留脱责推进
  return tail;
}

export function appendSoftHedge(narrative: string): string {
  const t = narrative.trim();
  if (!t) return EPISTEMIC_SOFT_HEDGE;
  if (t.includes("没有把话说死")) return t;
  return `${t}\n\n${EPISTEMIC_SOFT_HEDGE}`;
}

/**
 * 从文本中移除与 forbidden 事实重叠的过长子串（最小破坏原则）。
 */
export function scrubTextWithForbiddenFacts(text: string, forbidden: KnowledgeFact[]): { text: string; hit: boolean } {
  let out = text;
  let hit = false;
  for (const f of forbidden) {
    const content = String(f.content ?? "").replace(/\s+/g, "").trim();
    if (content.length < 5) continue;
    const win = Math.min(24, content.length);
    for (let len = win; len >= 5; len--) {
      for (let i = 0; i + len <= content.length; i++) {
        const chunk = content.slice(i, i + len);
        if (chunk.length < 5) continue;
        if (out.includes(chunk)) {
          out = out.split(chunk).join("……");
          hit = true;
        }
      }
    }
  }
  return { text: out, hit };
}

export function scrubDmStructuredFields(
  dm: Record<string, unknown>,
  forbidden: KnowledgeFact[]
): { mutated: boolean; fields: string[] } {
  const touched: string[] = [];
  const scrubArr = (key: string): void => {
    const arr = dm[key];
    if (!Array.isArray(arr)) return;
    const next = arr.map((row: unknown, idx: number) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const r = { ...(row as Record<string, unknown>) };
      let rowHit = false;
      for (const k of ["name", "title", "detail", "desc", "description"]) {
        if (typeof r[k] === "string") {
          const { text, hit } = scrubTextWithForbiddenFacts(r[k] as string, forbidden);
          if (hit) {
            r[k] = text.trim().length < 2 ? "（细节已省略）" : text;
            rowHit = true;
            touched.push(`${key}[${idx}].${k}`);
          }
        }
      }
      return rowHit ? r : row;
    });
    if (JSON.stringify(next) !== JSON.stringify(arr)) {
      dm[key] = next;
    }
  };
  scrubArr("codex_updates");
  scrubArr("task_updates");
  scrubArr("clue_updates");
  return { mutated: touched.length > 0, fields: touched };
}
