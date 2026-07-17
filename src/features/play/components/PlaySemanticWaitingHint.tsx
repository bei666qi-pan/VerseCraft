"use client";

import { memo } from "react";
import { useGameStore } from "@/store/useGameStore";

export type PlaySemanticWaitingKind =
  | "explore"
  | "dialogue"
  | "combat"
  | "use_item"
  | "investigate"
  | "meta"
  | "unknown";

export const PlaySemanticWaitingHint = memo(function PlaySemanticWaitingHint({
  kind,
}: {
  kind: PlaySemanticWaitingKind;
}) {
  const isEnglish = useGameStore((state) => state.language) === "en-US";
  const line = isEnglish
    ? kind === "explore"
      ? "Reading environmental clues / calibrating the scene…"
      : kind === "dialogue"
        ? "Tracing a shift in tone / weighing the reply…"
        : kind === "combat"
          ? "Checking action risk / resolving the threat…"
          : kind === "use_item"
            ? "Checking the item effect / aligning the outcome…"
            : kind === "investigate"
              ? "Focusing on a suspicious detail / shaping a usable clue…"
              : kind === "meta"
                ? "Syncing the game state / preparing the response…"
                : "Interpreting your action / building the response…"
    :
    kind === "explore"
      ? "正在检索环境线索 / 校准场景状态…"
      : kind === "dialogue"
        ? "正在捕捉语气变化 / 推演对方反应…"
        : kind === "combat"
          ? "正在检定行动风险 / 计算威胁反馈…"
          : kind === "use_item"
            ? "正在核验道具效果 / 对齐结算约束…"
            : kind === "investigate"
              ? "正在聚焦可疑细节 / 生成可用线索…"
              : kind === "meta"
                ? "正在同步界面状态 / 整理系统回应…"
                : "正在整理行动意图 / 构造回应骨架…";

  return (
    <div className="text-xs text-slate-500 tracking-wide">
      {line}
    </div>
  );
});
