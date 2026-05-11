/**
 * Worker 心跳：Redis 主路径 + 本地文件降级（供 Docker healthcheck 使用）。
 * Redis 不可用时仍写本地文件，确保容器健康检查不依赖外部服务。
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { getAppRedisClient } from "@/lib/ratelimit";

const HEARTBEAT_FILE = "/tmp/versecraft-worker-heartbeat";
const HEARTBEAT_TTL_SEC = 120;
const HEARTBEAT_STALE_SEC = 90;

function writeFileHeartbeat(data: WorkerHeartbeatData): void {
  try {
    const dir = "/tmp";
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(HEARTBEAT_FILE, JSON.stringify({ ...data, ts: Date.now() }), "utf8");
  } catch {
    // 静默，文件心跳是 best-effort
  }
}

function readFileHeartbeat(): WorkerHeartbeatData | null {
  try {
    if (!existsSync(HEARTBEAT_FILE)) return null;
    const raw = readFileSync(HEARTBEAT_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > HEARTBEAT_STALE_SEC * 1000) return null;
    return {
      workerId: typeof parsed.workerId === "string" ? parsed.workerId : "unknown",
      lastPollAt: typeof parsed.lastPollAt === "string" ? parsed.lastPollAt : null,
      lastJobProcessedAt: typeof parsed.lastJobProcessedAt === "string" ? parsed.lastJobProcessedAt : null,
      consecutiveFailures: typeof parsed.consecutiveFailures === "number" ? parsed.consecutiveFailures : 0,
    };
  } catch {
    return null;
  }
}

export type WorkerHeartbeatData = {
  workerId: string;
  lastPollAt: string | null;
  lastJobProcessedAt: string | null;
  consecutiveFailures: number;
};

export async function writeWorkerHeartbeat(data: WorkerHeartbeatData): Promise<void> {
  // 同时写文件（供 Docker healthcheck）和 Redis（供 /api/health）
  writeFileHeartbeat(data);

  const redis = await getAppRedisClient();
  if (!redis) return;
  try {
    const key = `vc:worker:heartbeat:${data.workerId}`;
    await redis
      .set(key, JSON.stringify({ ...data, ts: Date.now() }), { EX: HEARTBEAT_TTL_SEC })
      .catch(() => {});
  } catch {
    // Redis 不可用：文件心跳已写入
  }
}

export async function readAnyWorkerHeartbeat(): Promise<WorkerHeartbeatData | null> {
  const redis = await getAppRedisClient();
  if (redis) {
    try {
      // SCAN 所有 worker heartbeat key
      const keys: string[] = [];
      let cursorStr = "0";
      for (let i = 0; i < 8; i++) {
        const result = await redis.scan(cursorStr, {
          MATCH: "vc:worker:heartbeat:*",
          COUNT: 10,
        });
        keys.push(...result.keys);
        cursorStr = String(result.cursor);
        if (cursorStr === "0") break;
      }

      // 读取最新心跳
      let best: WorkerHeartbeatData | null = null;
      let bestTs = 0;
      for (const key of keys) {
        const raw = await redis.get(key).catch(() => null);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
          if (ts > bestTs && Date.now() - ts < HEARTBEAT_STALE_SEC * 1000) {
            bestTs = ts;
            best = {
              workerId: typeof parsed.workerId === "string" ? parsed.workerId : "unknown",
              lastPollAt: typeof parsed.lastPollAt === "string" ? parsed.lastPollAt : null,
              lastJobProcessedAt: typeof parsed.lastJobProcessedAt === "string" ? parsed.lastJobProcessedAt : null,
              consecutiveFailures: typeof parsed.consecutiveFailures === "number" ? parsed.consecutiveFailures : 0,
            };
          }
        } catch {
          continue;
        }
      }
      if (best) return best;
    } catch {
      // Redis scan 失败：降级到文件
    }
  }

  // Redis 不可用或无心跳：降级读文件
  return readFileHeartbeat();
}

/** 供 Docker healthcheck 使用：直接读本地文件心跳，不依赖 Redis */
export function isWorkerHeartbeatFresh(): boolean {
  const hb = readFileHeartbeat();
  return hb !== null;
}
