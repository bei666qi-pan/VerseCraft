import type { InputScene } from "@/lib/safety/input/scenes";
import type { PolicyEvaluationResult } from "@/lib/safety/policy/model";

export type UserFacingModerationMessage = {
  message: string;
  /**
   * Optional: for game scenes, provide a narrative-ish fallback that preserves immersion.
   */
  narrativeFallback?: string;
};

export function buildUserFacingMessage(args: {
  scene: InputScene;
  verdict: PolicyEvaluationResult;
}): UserFacingModerationMessage {
  const v = args.verdict;

  // Form-like scenes: short and procedural, no vendor info.
  if (args.scene === "feedback_input") {
    if (v.decision === "reject") return { message: "内容不符合提交规范，请修改后再提交。" };
    if (v.decision === "fallback" || v.decision === "rewrite") return { message: "内容存在风险点，请调整措辞后再提交。" };
    return { message: "ok" };
  }
  if (args.scene === "report_input") {
    if (v.decision === "reject") return { message: "内容不符合受理规范，请修改后再提交。" };
    if (v.decision === "fallback" || v.decision === "rewrite") return { message: "内容存在风险点，请删除联系方式/广告/违法细节后再提交。" };
    return { message: "ok" };
  }
  if (args.scene === "profile_input") {
    if (v.decision === "reject") return { message: "名称/档案内容不符合规范，请更换后再试。" };
    if (v.decision === "fallback" || v.decision === "rewrite") return { message: "名称/档案内容存在不适当表达，请更换后再试。" };
    return { message: "ok" };
  }
  if (args.scene === "public_publish_input" || args.scene === "search_or_comment_like_input") {
    if (v.decision === "reject") return { message: "公开内容不符合发布规范，请修改后再发布。" };
    if (v.decision === "fallback") return { message: "公开内容风险较高，已拦截发布。" };
    if (v.decision === "rewrite") return { message: "公开内容已做安全处理后可继续。"};
    return { message: "ok" };
  }

  // Game scene: preserve immersion; never reveal vendor details.
  if (args.scene === "private_story_action") {
    if (v.decision === "reject") {
      return {
        message: "当前行动无法执行，请调整描述后重试。",
        narrativeFallback: "当前行动触发安全规则，本回合未写入剧情。请调整描述后重试。",
      };
    }
    if (v.decision === "fallback") {
      return {
        message: "行动存在风险点，已安全回退。",
        narrativeFallback: "当前行动存在风险点，本回合未写入剧情。请换一种更安全的行动方式继续。",
      };
    }
    if (v.decision === "rewrite") {
      return {
        message: "行动措辞已做安全处理。",
        narrativeFallback: "当前行动措辞已做安全处理，请按处理后的描述继续。",
      };
    }
    return { message: "ok" };
  }

  return { message: "ok" };
}

