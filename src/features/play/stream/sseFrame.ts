// src/features/play/stream/sseFrame.ts
/**
 * Browser-side SSE framing helpers. Upstream/proxy may use CRLF; some buffers omit the final blank line.
 */

export function normalizeSseNewlines(buffer: string): string {
  return buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Split on blank line (LF) into complete SSE events; remainder stays in `rest`. */
export function takeCompleteSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = normalizeSseNewlines(buffer);
  const events: string[] = [];
  let rest = normalized;
  while (true) {
    const idx = rest.indexOf("\n\n");
    if (idx === -1) break;
    events.push(rest.slice(0, idx));
    rest = rest.slice(idx + 2);
  }
  return { events, rest };
}

export interface SseDmAccumulateResult {
  raw: string;
  sawNonEmptyData: boolean;
}

export const VERSECRAFT_STATUS_PREFIX = "__VERSECRAFT_STATUS__:";

export interface VerseCraftStatusFrame {
  stage: string;
  message?: string;
  requestId?: string;
  at?: number;
}

export function extractStatusFrameFromSseEvent(eventText: string): VerseCraftStatusFrame | null {
  const lines = eventText.split("\n");
  const payloads: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    payloads.push(line.slice(5).trimStart());
  }
  if (payloads.length === 0) return null;
  const joined = payloads.join("\n");
  if (!joined.startsWith(VERSECRAFT_STATUS_PREFIX)) return null;
  const body = joined.slice(VERSECRAFT_STATUS_PREFIX.length);
  try {
    const parsed = JSON.parse(body) as VerseCraftStatusFrame;
    if (!parsed || typeof parsed !== "object" || typeof parsed.stage !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Apply one SSE event block (may contain multiple `data:` lines). Per SSE, consecutive `data:` fields
 * are joined with `\n` before appending to the running buffer.
 */
export function accumulateDmFromSseEvent(eventText: string, prevRaw: string): SseDmAccumulateResult {
  let raw = prevRaw;
  const lines = eventText.split("\n");
  const payloads: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    payloads.push(line.slice(5).trimStart());
  }
  if (payloads.length === 0) {
    return { raw, sawNonEmptyData: false };
  }
  const sawNonEmptyData = payloads.some((p) => p.length > 0);
  if (!sawNonEmptyData) {
    return { raw, sawNonEmptyData: false };
  }
  const joined = payloads.join("\n");
  if (joined.startsWith(VERSECRAFT_STATUS_PREFIX)) {
    // 控制帧：保持对旧 JSON 累积器兼容（忽略即可，不进入 DM 原文）。
    return { raw, sawNonEmptyData: false };
  }
  if (joined.startsWith("__VERSECRAFT_FINAL__:")) {
    raw = joined.slice("__VERSECRAFT_FINAL__:".length);
    return { raw, sawNonEmptyData: true };
  }
  raw += joined;
  return { raw, sawNonEmptyData: true };
}

/**
 * Fold a full SSE document (e.g. from `await res.text()` on a closed response) into the DM JSON
 * buffer string consumed by `tryParseDM`. Handles multi-`data:` events and trailing partial events.
 */
export function foldSseTextToDmRaw(sseDocument: string): string {
  let buf = normalizeSseNewlines(sseDocument);
  let raw = "";
  while (true) {
    const { events, rest } = takeCompleteSseEvents(buf);
    buf = rest;
    for (const ev of events) {
      ({ raw } = accumulateDmFromSseEvent(ev, raw));
    }
    if (events.length === 0) break;
  }
  const orphan = buf.trim();
  if (orphan.length > 0 && orphan.startsWith("data:")) {
    ({ raw } = accumulateDmFromSseEvent(orphan, raw));
  }
  return raw;
}
