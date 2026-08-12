/** 指数退避（秒），供 vc_jobs 重试；无 server-only，可供单测导入。 */
import { clamp } from "@/lib/clamp";
export function computeJobBackoffSec(attempts: number, capSec = 3600): number {
  const a = clamp(20, 0, attempts);
  const raw = Math.min(capSec, Math.pow(2, a));
  return Math.max(1, Math.floor(raw));
}
