/**
 * T6：从 src/app/play/page.tsx 抽出的纯函数（原逻辑不变，仅迁移位置以获得单元测试覆盖）。
 *
 * 用途：客户端判定一次失败的 /api/chat 请求是否属于"可恢复的模型/网关限流"
 * （值得静默重试），还是应当直接展示错误（如鉴权失败、风控封禁、配额耗尽等不可恢复情况）。
 * 只影响前端重试/提示体验，不改变服务端权威判定。
 */

/** 是否命中"本地（VerseCraft 自身）限流"——与"上游模型网关限流"要区分对待，本地限流不建议静默重试。 */
export function isLocalRateLimitedPayload(args: {
  status?: number;
  code?: string;
  reason?: string;
  body?: string;
}): boolean {
  const haystack = [args.code, args.reason, args.body].filter(Boolean).join(" ").toLowerCase();
  return (
    args.status === 429 &&
    /\brate_limited\b/.test(haystack) &&
    !/\b(upstream|upstream_rate|queue_full|risk_control|capacity|overloaded)\b/.test(haystack)
  );
}

/**
 * 判定一次失败是否属于"可恢复的模型限流/过载"：
 *  - 本地限流（isLocalRateLimitedPayload）不算可恢复，需要用户等待而非静默重试。
 *  - 风控/配额/鉴权/封禁类关键字一律视为不可恢复，避免误重试掩盖真实错误。
 *  - 429/503 或限流类关键字视为可恢复。
 */
export function isRecoverableModelRateLimit(args: {
  status?: number;
  upstreamStatus?: number;
  code?: string;
  reason?: string;
  body?: string;
}): boolean {
  const code = String(args.code ?? "").toLowerCase();
  const reason = String(args.reason ?? "").toLowerCase();
  const body = String(args.body ?? "").toLowerCase();
  if (isLocalRateLimitedPayload({ status: args.status, code, reason, body })) return false;
  if (/risk_control|queue_full|quota|auth|forbidden|banned|invalid_ticket/.test(`${code} ${reason} ${body}`)) {
    return false;
  }
  if (args.upstreamStatus === 429 || args.upstreamStatus === 503) return true;
  if (args.status === 503) return true;
  return /rate[_-]?limit|too many requests|upstream_rate|overloaded|capacity/.test(`${code} ${reason} ${body}`);
}

/** 从已解析的 DM JSON 的 security_meta / internal_meta 里判定本轮是否属于可恢复的模型限流（用于前端触发重试）。 */
export function dmIndicatesRecoverableModelRateLimit(dm: unknown): boolean {
  if (!dm || typeof dm !== "object" || Array.isArray(dm)) return false;
  const meta = (dm as { security_meta?: unknown }).security_meta;
  const internal = (dm as { internal_meta?: unknown }).internal_meta;
  for (const source of [meta, internal]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const record = source as Record<string, unknown>;
    if (
      isRecoverableModelRateLimit({
        status: typeof record.kind === "string" && record.kind === "site_busy" ? 503 : undefined,
        upstreamStatus: typeof record.upstream_status === "number" ? record.upstream_status : undefined,
        code: typeof record.upstream_code === "string" ? record.upstream_code : undefined,
        reason: typeof record.reason === "string" ? record.reason : undefined,
        body: typeof record.kind === "string" ? record.kind : undefined,
      })
    ) {
      return true;
    }
  }
  return false;
}
