/** 指数退避（秒），供 vc_jobs 重试；无 server-only，可供单测导入。 */
export function computeJobBackoffSec(attempts: number, capSec = 3600): number {
  const a = Math.max(0, Math.min(attempts, 20));
  const raw = Math.min(capSec, Math.pow(2, a));
  return Math.max(1, Math.floor(raw));
}
