import type { FailMode, ModerationScene, ModerationStage } from "@/lib/safety/policy/model";

export type InputScene =
  | "private_story_action"
  | "profile_input"
  | "feedback_input"
  | "report_input"
  | "public_publish_input"
  | "search_or_comment_like_input";

export type InputScenePolicy = {
  policyScene: ModerationScene;
  stage: ModerationStage;
  failMode: FailMode;
  /**
   * True means this input is intended for public display (stricter by policy).
   */
  isPublic: boolean;
  /**
   * Controls whether rewrite is allowed. Some fields (e.g. usernames) should not be silently rewritten.
   */
  allowRewrite: boolean;
};

export function resolveInputScenePolicy(scene: InputScene): InputScenePolicy {
  switch (scene) {
    case "private_story_action":
      return {
        policyScene: "private_story_action",
        stage: "input",
        failMode: "fail_soft",
        isPublic: false,
        allowRewrite: true,
      };
    case "profile_input":
      return {
        policyScene: "account_profile",
        stage: "input",
        // Profile fields are user-visible and persistent: fail-closed is safer.
        failMode: "fail_closed",
        isPublic: true,
        allowRewrite: false,
      };
    case "feedback_input":
      return {
        policyScene: "feedback",
        stage: "input",
        failMode: "fail_closed",
        isPublic: false,
        allowRewrite: false,
      };
    case "report_input":
      return {
        policyScene: "report",
        stage: "input",
        failMode: "fail_closed",
        isPublic: false,
        allowRewrite: false,
      };
    case "public_publish_input":
      return {
        policyScene: "public_share",
        stage: "input",
        failMode: "fail_closed",
        isPublic: true,
        allowRewrite: true,
      };
    case "search_or_comment_like_input":
      return {
        // Future: treat as public-like by default.
        policyScene: "public_share",
        stage: "input",
        failMode: "fail_closed",
        isPublic: true,
        allowRewrite: true,
      };
  }
}

