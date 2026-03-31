import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import { stripDeveloperFacingFragments } from "@/lib/ui/playerFacingText";
import type { CodexEntry, GameTask } from "@/store/useGameStore";
import {
  looksLikeInternalEntityId,
  resolveAnomalyIdForPlayer,
  resolveNpcIdForPlayer,
  resolveTaskIssuerDisplay,
} from "@/lib/ui/displayNameResolvers";

function clip(t: string, max = 120): string {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const x = stripDeveloperFacingFragments(s);
  return x.length <= max ? x : `${x.slice(0, max - 1)}…`;
}

export function sanitizePlayerFacingInline(text: string, codex?: Record<string, CodexEntry> | null): string {
  let s = stripDeveloperFacingFragments(String(text ?? ""));
  // 禁止把 N-xxx / A-xxx 直接暴露给玩家：用解析名或泛称替换
  s = s.replace(/\bN-\d{3}\b/gi, (m) => resolveNpcIdForPlayer(m, codex));
  s = s.replace(/\bA-\d{3}\b/gi, (m) => resolveAnomalyIdForPlayer(m, codex));
  return s.replace(/\s{2,}/g, " ").trim();
}

export type TaskCardCopyKind = "formal" | "promise" | "clue";

export function inferTaskCardCopyKind(task: GameTask): TaskCardCopyKind {
  const layer = (task as { taskNarrativeLayer?: string }).taskNarrativeLayer;
  if (layer === "soft_lead") return "clue";
  if (layer === "conversation_promise") return "promise";
  return "formal";
}

export function buildTaskAtAGlanceLine(task: GameTask, codex?: Record<string, CodexEntry> | null): string {
  const kind = inferTaskCardCopyKind(task);
  const hint = clip(sanitizePlayerFacingInline(String(task.nextHint ?? ""), codex), 72);
  const hook = clip(sanitizePlayerFacingInline(String((task as any).playerHook ?? ""), codex), 72);
  const urgency = clip(sanitizePlayerFacingInline(String((task as any).urgencyReason ?? ""), codex), 72);

  const base = hint || urgency || hook || clip(sanitizePlayerFacingInline(task.desc ?? "", codex), 72);
  if (!base) {
    if (kind === "clue") return "线索先记着：它还没连上主线。";
    if (kind === "promise") return "先把对方的期待与门槛问清楚。";
    return "先确认关键门槛，再决定下一步。";
  }

  if (kind === "clue") return `线索：${base}`;
  if (kind === "promise") return `承诺：${base}`;
  return `推进要点：${base}`;
}

export function buildTaskMetaLines(task: GameTask, args: { codex?: Record<string, CodexEntry> | null; journalClues?: ClueEntry[] }): string[] {
  const codex = args.codex ?? null;
  const issuer = resolveTaskIssuerDisplay(task.issuerId, task.issuerName, codex ?? undefined);
  const lines: string[] = [];

  // 玩家可见字段：短、准、产品化；避免“研发字段翻译腔”
  if (issuer) {
    lines.push(`委托人：${issuer}`);
  }

  const relatedNpcIds = Array.isArray((task as any).relatedNpcIds) ? (task as any).relatedNpcIds : [];
  const issuerId = String(task.issuerId ?? "").trim();
  const related = [...new Set(relatedNpcIds.map((x: any) => String(x ?? "").trim()).filter(Boolean))]
    .filter((id) => id !== issuerId)
    .slice(0, 4)
    .map((id) => resolveNpcIdForPlayer(id, codex ?? undefined));
  if (related.length > 0) {
    lines.push(`牵涉人物：${related.join("、")}`);
  }

  const requiredItemIds = Array.isArray((task as any).requiredItemIds) ? (task as any).requiredItemIds : [];
  const req = [...new Set(requiredItemIds.map((x: any) => String(x ?? "").trim()).filter(Boolean))].slice(0, 6);
  if (req.length > 0) {
    // requiredItemLabels 在 UI 层会做 item name 解析；这里保守只输出“你还差什么”的提示句式
    lines.push("条件：仍缺关键物证/门槛（见“你还缺”）");
  }

  const clueRefs = (args.journalClues ?? []).filter((c) => c.relatedObjectiveId === task.id).slice(0, 3);
  if (clueRefs.length > 0) {
    const titles = clueRefs.map((c) => clip(sanitizePlayerFacingInline(c.title, codex), 20)).filter(Boolean).join("；");
    if (titles) lines.push(`线索推进：${titles}`);
  }

  return lines
    .map((x) => sanitizePlayerFacingInline(x, codex))
    .filter((x) => x && !looksLikeInternalEntityId(x));
}

