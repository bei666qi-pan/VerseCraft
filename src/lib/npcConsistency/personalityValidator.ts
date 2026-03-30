/**
 * 阶段7：人格漂移 / 高魅力模板塌缩 / 与试探-回避风格冲突的叙事校验（规则层，无二次模型）。
 */

import type { NpcMemoryPrivilege } from "@/lib/registry/types";

export type PersonalityDriftSeverity = "none" | "low" | "high";

export type PersonalityValidatorResult = {
  personalityDriftDetected: boolean;
  driftType: string | null;
  severity: PersonalityDriftSeverity;
  rewriteNeeded: boolean;
};

function str(p: Record<string, unknown> | null, key: string): string {
  const v = p?.[key];
  return typeof v === "string" ? v.trim() : "";
}

/** 高魅力共用腔模板（多人同段命中多种 → 同质化） */
const MYSTIC_TEMPLATE_RE = /温柔(?:而|又)?神秘|神秘(?:而|又)?温柔|浅浅一笑|眼底(?:像)?藏着|仿佛藏着|若有若无的深意/;
const COLD_TEMPLATE_RE = /高冷|生人勿近|冰山|拒人于千里之外|不屑(?:于)?解释/;
const FLIRT_RE = /调情|暧昧地|抛了个媚眼|芳心|撩(?:拨)?|放电/;

const DIRECT_SPILL_RE = /(?:我|咱)(?:就|直接)告诉你|真相就是|说白了|一句话说清|不用再猜了/;
const EVASION_HINT_RE = /回避|绕开|含糊|留半句|试探|不把话说满|点到为止/;

export function validatePersonalityNarrative(input: {
  narrative: string;
  actorPersonalityPacket: Record<string, unknown> | null;
  baselineAttitude: string | null;
  memoryPrivilege: NpcMemoryPrivilege;
}): PersonalityValidatorResult {
  const n = String(input.narrative ?? "");
  if (!n.trim()) {
    return {
      personalityDriftDetected: false,
      driftType: null,
      severity: "none",
      rewriteNeeded: false,
    };
  }

  const major =
    input.memoryPrivilege === "major_charm" ||
    input.memoryPrivilege === "xinlan" ||
    input.memoryPrivilege === "night_reader";
  const pkt = input.actorPersonalityPacket;
  const probePush = str(pkt, "probe_push_pull");
  const mustNot = str(pkt, "must_not_caricature");

  let driftType: string | null = null;
  let severity: PersonalityDriftSeverity = "none";

  /** 与「回避/试探」锚明显冲突的直球泄底 */
  if (EVASION_HINT_RE.test(probePush) && DIRECT_SPILL_RE.test(n)) {
    driftType = "truth_style_conflict";
    severity = "high";
  }

  /** 高魅力：多种通用模板同时出现 → 塌缩成「同一种人」 */
  if (major) {
    let templateHits = 0;
    if (MYSTIC_TEMPLATE_RE.test(n)) templateHits += 1;
    if (COLD_TEMPLATE_RE.test(n)) templateHits += 1;
    if (FLIRT_RE.test(n)) templateHits += 1;
    if (templateHits >= 2) {
      driftType = driftType ?? "major_charm_homogenization";
      severity = severity === "high" ? "high" : "high";
    } else if (templateHits === 1 && FLIRT_RE.test(n)) {
      driftType = driftType ?? "major_charm_flirt_template";
      severity = severity === "high" ? "high" : "low";
    } else if (templateHits === 1 && (MYSTIC_TEMPLATE_RE.test(n) || COLD_TEMPLATE_RE.test(n))) {
      driftType = driftType ?? "major_charm_single_template";
      severity = severity === "high" ? "high" : "low";
    }
  }

  /** packet 明示禁脸谱，叙事仍踩常见贬义模板 */
  if (mustNot && /解说腔|温柔神秘|禁脸谱/.test(mustNot) && MYSTIC_TEMPLATE_RE.test(n)) {
    driftType = driftType ?? "violates_must_not_caricature";
    severity = severity === "high" ? "high" : "low";
  }

  /** 态度 hostile，叙事过度亲昵 */
  if (input.baselineAttitude === "hostile" && /亲爱的|宝贝|好想你|贴(?:上|近)来/.test(n)) {
    driftType = driftType ?? "attitude_affection_mismatch";
    severity = severity === "high" ? "high" : "low";
  }

  const personalityDriftDetected = driftType !== null;
  return {
    personalityDriftDetected,
    driftType,
    severity,
    rewriteNeeded: personalityDriftDetected,
  };
}
