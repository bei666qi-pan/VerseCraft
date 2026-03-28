// 阶段 6：叙事咬合调试开关（客户端需 NEXT_PUBLIC_*）

export function narrativeDebugEnabled(): boolean {
  try {
    if (typeof process !== "undefined" && process.env) {
      if (process.env.NEXT_PUBLIC_VERSECRAFT_NARRATIVE_DEBUG === "1") return true;
      if (process.env.VERSECRAFT_NARRATIVE_DEBUG === "1") return true;
    }
  } catch {
    // ignore
  }
  return false;
}
