"use client";

import { mobileReadingTheme } from "../theme";
import type { MobileOptionsEmptyStateProps } from "../types";

export function MobileOptionsEmptyState({ busy }: MobileOptionsEmptyStateProps) {
  return (
    <div data-testid="mobile-options-dropdown" className={mobileReadingTheme.optionsEmptyState} role="status">
      {busy ? "主笔正在按当前剧情整理可选行动…" : "当前暂无可用选项。"}
    </div>
  );
}
