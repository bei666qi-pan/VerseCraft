/**
 * Logical model roles: business and routing use only these identifiers.
 * Upstream model names come from env (AI_MODEL_*) and are resolved at the gateway layer.
 */
export const AI_LOGICAL_ROLES = ["main", "control", "enhance", "reasoner"] as const;

export type AiLogicalRole = (typeof AI_LOGICAL_ROLES)[number];

const ROLE_SET = new Set<string>(AI_LOGICAL_ROLES);

export function isAiLogicalRole(s: string): s is AiLogicalRole {
  return ROLE_SET.has(s);
}

export function normalizeAiLogicalRole(raw: string | undefined | null): AiLogicalRole | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (isAiLogicalRole(t)) return t;
  return null;
}

/** Map legacy vendor logical IDs from AI_PLAYER_MODEL_CHAIN to roles (migration only). */
export function legacyVendorModelIdToRole(raw: string): AiLogicalRole | null {
  const x = raw.trim().toLowerCase();
  if (
    x === "deepseek-v3.2" ||
    x === "deepseek-chat" ||
    x === "deepseek-v3.2-chat" ||
    x === "deepseek_v3.2"
  ) {
    return "main";
  }
  if (x === "glm-5-air" || x === "glm_5_air" || x === "glm-4-flash") return "control";
  if (x === "deepseek-reasoner" || x === "deepseek_reasoner") return "reasoner";
  if (x === "minimax-m2.7-highspeed" || x.includes("minimax")) return "enhance";
  return null;
}

export function parseRoleChain(raw: string | undefined, fallback: AiLogicalRole[]): AiLogicalRole[] {
  if (!raw) return fallback;
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: AiLogicalRole[] = [];
  const seen = new Set<AiLogicalRole>();
  for (const p of parts) {
    const id = normalizeAiLogicalRole(p) ?? legacyVendorModelIdToRole(p);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : fallback;
}
