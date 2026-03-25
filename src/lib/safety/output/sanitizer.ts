import type { ModerationScene } from "@/lib/safety/policy/model";

function replaceAll(re: RegExp, input: string, replacement: string): string {
  return input.replace(re, replacement);
}

export function sanitizeNarrativeForOutput(args: {
  scene: ModerationScene;
  narrative: string;
}): { narrative: string; usedRewrite: boolean } {
  const raw = args.narrative ?? "";
  if (!raw.trim()) return { narrative: raw, usedRewrite: false };

  let out = raw;
  let usedRewrite = false;

  // 1) Contact / linkage (avoid pulling users into real-world channels).
  const urlRe = /\bhttps?:\/\/[^\s]+/gi;
  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const phoneCnRe = /(?:\+?86[-\s]?)?1[3-9]\d{9}/g;

  const contactReplacement = "[已屏蔽联系方式/链接]";
  const beforeContact = out;
  out = replaceAll(urlRe, out, contactReplacement);
  out = replaceAll(emailRe, out, contactReplacement);
  out = replaceAll(phoneCnRe, out, contactReplacement);
  if (out !== beforeContact) usedRewrite = true;

  // 2) Step-by-step “how to” / operational abuse markers.
  // Keep world tone by converting to “收回/切断念头” rather than direct blanking.
  const howToRe = /\b(如何|怎么做|步骤|教程|操作|指南|流程)\b.{0,16}?(?:(伤害|自残|爆炸|毒|诈骗|行骗|攻击|杀死|分尸|肢解))/gi;
  const beforeHow = out;
  out = replaceAll(howToRe, out, "你把危险的念头掐灭在喉咙里，选择改走更安全的路。");
  if (out !== beforeHow) usedRewrite = true;

  // 3) Explicit gore/violence details downgrade to atmosphere-only phrasing.
  const goreRe = /(血肉模糊|内脏|肢解|开膛|剁碎|分尸|断肢|溅射|鲜血|刀口)/g;
  const goreReplacement = "不堪言说的痕迹与阴影";
  const beforeGore = out;
  out = replaceAll(goreRe, out, goreReplacement);
  if (out !== beforeGore) usedRewrite = true;

  // 4) Insult / harassment tone: keep narrative safety without “客服腔”.
  const insultRe = /(你(是|算)个).{0,10}(垃圾|废物|畜生|蠢|傻)/g;
  const beforeInsult = out;
  out = replaceAll(insultRe, out, "你收起了恶意，危险的情绪被你压进黑暗。");
  if (out !== beforeInsult) usedRewrite = true;

  // 5) Keep length bounded to avoid bloated “safe output” chunks.
  const maxLen = args.scene === "public_share" ? 1200 : 2500;
  out = out.trim();
  if (out.length > maxLen) {
    usedRewrite = true;
    out = out.slice(0, maxLen - 1) + "…";
  }

  return { narrative: out, usedRewrite };
}

