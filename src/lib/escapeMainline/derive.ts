import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";

export type EscapeDerivationInput = {
  nowHour: number;
  nowTurn: number;
  playerLocation: string;
  tasks: GameTaskV2[];
  codex: Record<string, any>;
  inventoryItemIds: string[];
  worldFlags: string[];
  memoryEntries: MemorySpineEntry[];
};

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function hasItem(ids: string[], id: string): boolean {
  return (ids ?? []).some((x) => String(x ?? "").trim() === id);
}

export function deriveEscapeFactors(input: EscapeDerivationInput): {
  routeHintCodes: string[];
  conditionMetCodes: string[];
  falseLeadCodes: string[];
  blockers: Array<{ code: string; label: string; severity: "low" | "medium" | "high" }>;
  pendingFinalAction: string | null;
} {
  const loc = String(input.playerLocation ?? "");
  const mem = input.memoryEntries ?? [];
  const invIds = input.inventoryItemIds ?? [];
  const worldFlags = new Set((input.worldFlags ?? []).map((x) => String(x ?? "").trim()).filter(Boolean));

  // 路线碎片：优先吃 memorySpine 的 route_hint / secret_fragment
  const routeHintCodes = uniq(
    mem
      .filter((e) => e.status === "active" && (e.kind === "route_hint" || e.kind === "secret_fragment"))
      .map((e) => e.mergeKey || e.summary)
      .slice(0, 12)
      .map((x) => `frag:${String(x).slice(0, 24)}`),
    6
  );

  // 条件满足（结构化推导示范）
  const conditionMetCodes: string[] = [];
  if (loc.startsWith("B2_") || worldFlags.has("b2_access_granted")) conditionMetCodes.push("obtain_b2_access");
  // 示例钥物：先用 unlock flag / 物品 id 作为可验证真相源
  if (worldFlags.has("permit.one_time") || hasItem(invIds, "I-C12")) conditionMetCodes.push("secure_key_item");
  // gatekeeper 信任：从 codex 关系字段推导（示范：N-018 / N-010 任一达到阈值）
  const trustN018 = Number(input.codex?.["N-018"]?.trust ?? 0);
  const trustN010 = Number(input.codex?.["N-010"]?.trust ?? 0);
  if ((Number.isFinite(trustN018) && trustN018 >= 45) || (Number.isFinite(trustN010) && trustN010 >= 50)) {
    conditionMetCodes.push("gain_trust_from_gatekeeper");
  }
  // 代价试炼：以任务完成作为结构化真相源
  const completed = (input.tasks ?? []).filter((t) => t.status === "completed").map((t) => t.id);
  if (completed.includes("main_escape_cost_trial") || completed.includes("char_mirror_patrol_debt")) {
    conditionMetCodes.push("survive_cost_trial");
  }

  // 假出口：来自 memory 的 escape_condition 但 anchors 命中“假路线”标签
  const falseLeadCodes = uniq(
    mem
      .filter((e) => e.status === "active" && e.kind === "escape_condition")
      .filter((e) => (e.recallTags ?? []).some((t) => String(t).includes("false")))
      .map((e) => e.mergeKey || e.summary)
      .map((x) => `false:${String(x).slice(0, 20)}`),
    3
  );

  const blockers: Array<{ code: string; label: string; severity: "low" | "medium" | "high" }> = [];
  if (routeHintCodes.length === 0) blockers.push({ code: "no_route", label: "路线碎片不足：出口路径仍不清晰。", severity: "high" });
  if (!conditionMetCodes.includes("obtain_b2_access")) blockers.push({ code: "no_b2_access", label: "缺少进入地下二层的权限/通行。", severity: "high" });
  if (!conditionMetCodes.includes("secure_key_item")) blockers.push({ code: "no_key_item", label: "缺少关键钥物。", severity: "medium" });
  if (!conditionMetCodes.includes("gain_trust_from_gatekeeper")) blockers.push({ code: "no_gatekeeper", label: "缺少守门人认可（或替代手段）。", severity: "medium" });
  if (!conditionMetCodes.includes("survive_cost_trial")) blockers.push({ code: "no_cost_trial", label: "代价尚未支付；出口不会白送。", severity: "medium" });

  const pendingFinalAction =
    loc.startsWith("B2_") && blockers.length === 0 ? "perform_escape_action_at_gate" : null;

  return { routeHintCodes, conditionMetCodes: uniq(conditionMetCodes, 8), falseLeadCodes, blockers, pendingFinalAction };
}

