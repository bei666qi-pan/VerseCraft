import type { EscapeCondition, EscapeMainlineState } from "./types";
import { createDefaultEscapeMainline } from "./types";
import { CONTENT_PACKS } from "@/lib/contentSpec/packs";

export function createDefaultEscapeConditions(): EscapeCondition[] {
  const fromPack = CONTENT_PACKS.find((p) => Array.isArray(p.escapeSpecs?.conditions) && (p.escapeSpecs?.conditions?.length ?? 0) > 0)
    ?.escapeSpecs?.conditions ?? null;
  if (!Array.isArray(fromPack) || fromPack.length === 0) {
    return [
      { code: "get_exit_route_map", label: "拼出出口路线的地图碎片", kind: "route_hint", required: true },
      { code: "obtain_b2_access", label: "拿到进入地下二层的权限/通行", kind: "access_grant", required: true },
      { code: "secure_key_item", label: "拿到关键钥物（开门的‘资格’）", kind: "escape_condition", required: true },
      { code: "gain_trust_from_gatekeeper", label: "让守门人认可你（或找到替代办法）", kind: "escape_condition", required: true },
      { code: "survive_cost_trial", label: "承受一次代价试炼", kind: "cost_or_sacrifice", required: true },
      { code: "choose_sacrifice", label: "做出一次不可回头的取舍", kind: "cost_or_sacrifice", required: false },
      { code: "invalidate_false_route", label: "拆穿一个假出口", kind: "false_lead", required: false },
    ];
  }
  return fromPack.map((c) => ({
    code: (c.code ?? "").replace(/^escape\.condition\./, "") as any,
    label: c.label,
    kind: c.kind,
    required: !!c.required,
  })) as any;
}

export function createDefaultEscapeMainlineTemplate(nowHour: number): EscapeMainlineState {
  const base = createDefaultEscapeMainline(nowHour);
  return {
    ...base,
    knownConditions: createDefaultEscapeConditions(),
    blockers: [
      { code: "no_route", label: "路线碎片不完整；你还无法确认出口路径。", severity: "high" },
      { code: "no_b2_access", label: "你没有进入地下二层的权限。", severity: "high" },
    ],
  };
}

