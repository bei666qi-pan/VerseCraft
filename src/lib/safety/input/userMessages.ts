import type { InputScene } from "@/lib/safety/input/scenes";
import type { PolicyEvaluationResult } from "@/lib/safety/policy/model";

export type UserFacingModerationMessage = {
  message: string;
  narrativeFallback?: string;
};

export function buildUserFacingMessage(args: {
  scene: InputScene;
  verdict: PolicyEvaluationResult;
}): UserFacingModerationMessage {
  const v = args.verdict;

  if (args.scene === "feedback_input") {
    if (v.decision === "reject") return { message: "内容不符合提交规范，请修改后再提交。" };
    if (v.decision === "fallback" || v.decision === "rewrite") return { message: "内容存在风险点，请调整措辞后再提交。" };
    return { message: "ok" };
  }
  if (args.scene === "report_input") {
    if (v.decision === "reject") return { message: "内容不符合受理规范，请修改后再提交。" };
    if (v.decision === "fallback" || v.decision === "rewrite") return { message: "内容存在风险点，请删除联系方式、广告或违法细节后再提交。" };
    return { message: "ok" };
  }
  if (args.scene === "profile_input") {
    if (v.decision === "reject") return { message: "名称或档案内容不符合规范，请更换后再试。" };
    if (v.decision === "fallback" || v.decision === "rewrite") return { message: "名称或档案内容存在不适当表达，请更换后再试。" };
    return { message: "ok" };
  }
  if (args.scene === "public_publish_input" || args.scene === "search_or_comment_like_input") {
    if (v.decision === "reject") return { message: "公开内容不符合发布规范，请修改后再发布。" };
    if (v.decision === "fallback") return { message: "公开内容风险较高，已拦截发布。" };
    if (v.decision === "rewrite") return { message: "公开内容已做安全处理后可继续。" };
    return { message: "ok" };
  }

  if (args.scene === "private_story_action") {
    if (v.decision === "reject") {
      return { message: "该输入涉及涉黄、涉暴或违法伤害内容，不能继续。" };
    }
    if (v.decision === "fallback") {
      return { message: "这一步已做安全处理，请换个行动继续。" };
    }
    if (v.decision === "rewrite") {
      return { message: "这一步已做安全改写，继续推进。" };
    }
    return { message: "ok" };
  }

  return { message: "ok" };
}
