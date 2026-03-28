/** 生产默认可关；开发或显式开启时打印 change set 轨迹 */
export function isDmChangeSetDebugEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.VERSECRAFT_DM_CHANGESET_DEBUG === "1" || process.env.VERSECRAFT_DM_CHANGESET_DEBUG === "true";
}

export function dmChangeSetDebugLog(message: string, payload?: Record<string, unknown>): void {
  if (!isDmChangeSetDebugEnabled()) return;
  if (payload && Object.keys(payload).length > 0) {
    console.info(`[dm_change_set] ${message}`, payload);
  } else {
    console.info(`[dm_change_set] ${message}`);
  }
}
