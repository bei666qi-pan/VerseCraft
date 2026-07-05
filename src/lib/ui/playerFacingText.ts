/**
 * 玩家可见文案清洗：去掉实现层/文档指针/系统设定术语的残留，不改动叙事权威源文件中的 DM 用段落。
 */

const DEV_PHRASE_RES: readonly { re: RegExp; replace: string }[] = [
  { re: /详情见\s*majorNpcDeepCanon\.?/gi, replace: "" },
  { re: /majorNpcDeepCanon/gi, replace: "" },
  { re: /deep\s*packet/gi, replace: "" },
  { re: /conditionHint\s*:\s*deep/gi, replace: "" },
  { re: /辅锚之[一二三四五六七八九十\d]+/g, replace: "" },
  { re: /七辅锚/g, replace: "" },
  { re: /registry\/[\w./-]+/gi, replace: "" },
  { re: /\.tsx?[:：]\d+/g, replace: "" },
  // 已知内部字段/触发码名（例如 guidanceLevel、visited:...、talked_to:...），
  // 可能被模型忘记规则而原样带出；名字本身在中文叙事里就不该合法出现，
  // 不要求一定带 :/= 取值后缀——后缀存在时一并清掉。
  {
    re: /\b(visited|talked_to|guidanceLevel|taskNarrativeLayer|surfaceClass|surfaceSlot|dramaticType|goalKind|grantState|claimMode|npcProactiveGrant|issuerPersonaMode|issuerSoftRevealMode|issuerPressureStyle|issuerDemandStyle|issuerTrustTestMode|worldConsequences|hiddenTriggerConditions|followupSeedCodes|promiseBinding)\b\s*[:=]?\s*[\w.:-]*/gi,
    replace: "",
  },
  // 兜底：narrative 里几乎不会合法出现 snake_case / lowerCamelCase 英文标识符，
  // 出现多半是内部字段名或事件 flag 泄漏（如 b1_guidance_seeded、escape:route_fragment_seeded）。
  { re: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, replace: "" },
  { re: /\b[a-z]+(?:[A-Z][a-z0-9]*){2,}\b/g, replace: "" },
];

/**
 * 从可能混入注册表工作副本的字符串中剔除明显「开发者语气」片段。
 */
export function stripDeveloperFacingFragments(text: string): string {
  let t = String(text ?? "");
  for (const { re, replace } of DEV_PHRASE_RES) {
    t = t.replace(re, replace);
  }
  return t
    .replace(/\s{2,}/g, " ")
    .replace(/；\s*；+/g, "；")
    .replace(/^\s*[；，、]\s*/g, "")
    .replace(/\s*[；，、]\s*$/g, "")
    .trim();
}
