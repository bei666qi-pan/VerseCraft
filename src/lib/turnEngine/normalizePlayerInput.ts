// src/lib/turnEngine/normalizePlayerInput.ts
/**
 * Phase-2: player input normalization.
 *
 * Produces a strongly-typed `NormalizedPlayerIntent` from the moderated
 * `latestUserInput` + optional control-plane preflight result + ambient client
 * state. This is the first explicit layer in the new turn engine backbone and
 * should NOT own any narrative concerns.
 *
 * Design notes:
 * - Never lossy for the raw text; `rawText` preserves moderated input so the
 *   narrative layer can still consume it.
 * - When control preflight is unavailable (fast lane / degraded), fall back to
 *   deterministic heuristics (see `heuristicIntentKind`).
 * - `isSystemTransition` matches the "system transition" detection used by
 *   `inferPlannedTurnMode`, keeping routing consistent with turn-mode planning.
 */
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import type {
  NormalizedPlayerIntent,
  NormalizedPlayerIntentKind,
} from "@/lib/turnEngine/types";

const SYSTEM_TRANSITION_RE =
  /^(迎接终焉|进入结算|查看结算|复活|确认复活|继续结算|终章切换|进入终章|关闭结算)$/;

const EXPLORE_RE = /^(我)?(走|前往|进入|回到|离开|搜索|调查|查看|观察|上楼|下楼|打开|关闭)/;
const INVESTIGATE_RE = /(仔细(查看|观察|检查)|仔细翻|逐一(检查|确认)|对比|分析|找线索|搜集证据)/;
const COMBAT_RE = /(攻击|袭击|开枪|射击|挥刀|刺|砍|锁喉|反击|压制|反杀|防御|格挡|闪避)/;
const DIALOGUE_RE = /(对话|询问|问清|交谈|告诉|回答|回应|喊话|呼唤|和.*说|向.*说|对.*说)/;
const USE_ITEM_RE = /(使用|服用|吃下|喝下|点亮|打开|用|拿出|装备|换上)/;
const META_RE = /(存档|读档|打开(菜单|设置)|查看(图鉴|任务|背包|仓库))/;

function stripForNormalization(text: string): string {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[，,；;。.!！？?：:、\s]+/g, "");
}

function heuristicIntentKind(text: string): NormalizedPlayerIntentKind {
  const t = String(text ?? "").trim();
  if (!t) return "other";
  if (SYSTEM_TRANSITION_RE.test(t)) return "system_transition";
  if (META_RE.test(t)) return "meta";
  if (COMBAT_RE.test(t)) return "combat";
  if (INVESTIGATE_RE.test(t)) return "investigate";
  if (DIALOGUE_RE.test(t)) return "dialogue";
  if (USE_ITEM_RE.test(t)) return "use_item";
  if (EXPLORE_RE.test(t)) return "explore";
  return "other";
}

function mapControlIntent(
  intent: PlayerControlPlane["intent"] | null | undefined
): NormalizedPlayerIntentKind | null {
  if (!intent) return null;
  switch (intent) {
    case "explore":
    case "combat":
    case "dialogue":
    case "use_item":
    case "investigate":
    case "meta":
    case "other":
      return intent;
    default:
      return null;
  }
}

export type NormalizePlayerInputArgs = {
  latestUserInput: string;
  control: PlayerControlPlane | null;
  riskTags?: readonly string[];
  isFirstAction: boolean;
  shouldApplyFirstActionConstraint: boolean;
  clientPurpose: "normal" | "options_regen_only";
  /** Hard cap on the stored raw text length (defense in depth). */
  maxRawChars?: number;
};

export function normalizePlayerInput(
  args: NormalizePlayerInputArgs
): NormalizedPlayerIntent {
  const rawLimit = Math.max(16, args.maxRawChars ?? 1200);
  const rawText = String(args.latestUserInput ?? "").slice(0, rawLimit);
  const normalizedText = stripForNormalization(rawText);

  const controlKind = mapControlIntent(args.control?.intent ?? null);
  const heuristicKind = heuristicIntentKind(rawText);

  const kind: NormalizedPlayerIntentKind = (() => {
    if (args.clientPurpose === "options_regen_only") return "meta";
    if (heuristicKind === "system_transition") return "system_transition";
    if (controlKind && controlKind !== "other") return controlKind;
    return heuristicKind;
  })();

  const rawSlots = args.control?.extracted_slots ?? {};
  const slots = {
    ...(typeof rawSlots.target === "string" && rawSlots.target.trim()
      ? { target: rawSlots.target.trim() }
      : {}),
    ...(typeof rawSlots.item_hint === "string" && rawSlots.item_hint.trim()
      ? { itemHint: rawSlots.item_hint.trim() }
      : {}),
    ...(typeof rawSlots.location_hint === "string" && rawSlots.location_hint.trim()
      ? { locationHint: rawSlots.location_hint.trim() }
      : {}),
  };

  const riskTags = Array.isArray(args.riskTags)
    ? args.riskTags.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : Array.isArray(args.control?.risk_tags)
      ? args.control!.risk_tags.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];

  const isSystemTransition = heuristicKind === "system_transition" || kind === "system_transition";

  return {
    rawText,
    normalizedText,
    kind,
    slots,
    riskTags,
    isSystemTransition,
    isFirstAction: Boolean(args.isFirstAction),
    clientPurpose: args.clientPurpose,
  };
}
