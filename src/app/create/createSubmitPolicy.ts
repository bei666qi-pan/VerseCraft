const CREATE_VISIBLE_SAFETY_PATTERN =
  /(涉黄|色情|裸聊|性内容|强奸|性侵|未成年.{0,8}性|涉暴|暴力|血腥|虐杀|肢解|分尸|杀人教程|违法伤害|自伤|自残|炸弹|爆炸物|枪支制造|恐怖袭击|sexual|explicit|porn|erotic|gore|graphic[_ -]?violence|illegal[_ -]?harm|harmful[_ -]?instruction)/i;

export type CreateProfileSafetyDecision =
  | { ok: true }
  | { ok: false; message: string; reason: "visible_safety" };

export function validateCreateProfileBeforeLocalStart(args: {
  name: string;
  personality: string;
}): CreateProfileSafetyDecision {
  const text = `${String(args.name ?? "")}\n${String(args.personality ?? "")}`;
  if (CREATE_VISIBLE_SAFETY_PATTERN.test(text)) {
    return {
      ok: false,
      reason: "visible_safety",
      message: "名称或档案内容涉及涉黄、涉暴或违法伤害内容，请更换后再试。",
    };
  }
  return { ok: true };
}
