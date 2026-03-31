import type { NPC, NpcProfileV2 } from "@/lib/registry/types";
import type { CodexEntry } from "@/store/useGameStore";
import {
  getCombatStyleFromRegistry,
  resolveNpcStyleTemplateKey,
  type CombatStyleResolveResult,
} from "./npcCombatStyles";
import type { HiddenNpcCombatProfileV1 } from "./types";

function clip(xs: string[], cap: number): string[] {
  return (xs ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, cap);
}

export function resolveNpcCombatStyle(args: {
  npcId: string;
  npcProfileV2: NpcProfileV2 | null;
  npcRegistryRow?: NPC | null;
  codexEntry?: CodexEntry | null;
  hiddenProfile?: Pick<HiddenNpcCombatProfileV1, "storyClass" | "styleKey" | "styleTags"> | null;
}): CombatStyleResolveResult {
  const npcId = String(args.npcId ?? "").trim() || "unknown_npc";

  const reasons: string[] = [];

  // 1) 显式 styleKey（来自隐藏画像）优先
  const explicit = String(args.hiddenProfile?.styleKey ?? "").trim();
  if (explicit) {
    const def = getCombatStyleFromRegistry(explicit);
    if (def) {
      reasons.push("使用隐藏画像的 styleKey");
      return { styleKey: explicit, def, reasons: clip(reasons, 4) };
    }
  }

  // 2) 由 storyClass/specialty/styleTags 推导模板 key
  const templateKey = resolveNpcStyleTemplateKey({
    npcId,
    npcProfileV2: args.npcProfileV2,
    npcRegistryRow: args.npcRegistryRow ?? null,
    hiddenProfile: args.hiddenProfile ?? null,
  });
  const def2 = getCombatStyleFromRegistry(templateKey);
  if (def2) {
    reasons.push("使用风格模板兜底");
    return { styleKey: templateKey, def: def2, reasons: clip(reasons, 4) };
  }

  // 3) 最终兜底：服务职能
  const fallback = "tpl:service_staff";
  const def3 = getCombatStyleFromRegistry(fallback)!;
  reasons.push("最终兜底");
  return { styleKey: fallback, def: def3, reasons: clip(reasons, 4) };
}

