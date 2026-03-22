/**
 * Logical model roles for VerseCraft AI routing.
 * Upstream vendor model names are configured via AI_MODEL_* env vars, not in code.
 */
export type { AiLogicalRole } from "./logicalRoles";
export {
  AI_LOGICAL_ROLES,
  isAiLogicalRole,
  legacyVendorModelIdToRole,
  normalizeAiLogicalRole,
  parseRoleChain,
} from "./logicalRoles";
