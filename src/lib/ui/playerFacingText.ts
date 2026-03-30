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
