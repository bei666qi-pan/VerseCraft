import type { NpcContentSpec, TaskContentSpec, EscapeContentSpec } from "./types";
import type { NpcProfileV2 } from "@/lib/registry/types";
import { clampText } from "./naming";

export function buildNpcProfileV2FromSpec(spec: NpcContentSpec): NpcProfileV2 | null {
  if (!spec?.id) return null;
  // 仅生成 ProfileV2（用于覆盖 NPCS_BASE），保持旧运行时结构兼容
  return {
    id: spec.id,
    homeNode: spec.identity.homeNode,
    display: {
      name: spec.identity.displayName,
      appearance: clampText(spec.surface.appearance, 180),
      floor: spec.identity.floor,
      publicPersonality: clampText(spec.surface.publicPersonality, 60),
      specialty: clampText(spec.identity.specialty, 80),
      combatPower: 6, // 不在 spec 强制重写数值；必要时仍可在旧 registry 调整
    },
    interaction: {
      speechPattern: clampText(spec.interaction.speechPattern, 120),
      taboo: clampText(spec.interaction.tabooBoundary, 160),
      relationshipHooks: (spec.interaction.relationshipHooks ?? []).slice(0, 6),
      questHooks: (spec.interaction.questHooks ?? []).slice(0, 6),
      surfaceSecrets: (spec.interaction.surfaceSecrets ?? []).slice(0, 6),
    },
    deepSecret: spec.secret
      ? {
          trueMotives: (spec.secret.trueMotives ?? []).slice(0, 4),
          trueCombatPower: undefined,
          conspiracyRole: spec.secret.conspiracyRole ?? "",
          revealConditions: (spec.secret.revealConditions ?? []).slice(0, 6),
        }
      : undefined,
  } as any;
}

export function getEscapeConditionSpecsMap(spec: EscapeContentSpec | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of spec?.conditions ?? []) {
    if (!c?.code) continue;
    out[c.code] = c.label;
  }
  return out;
}

