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
  if (joined.startsWith("__VERSECRAFT_FINAL__:")) {
    raw = joined.slice("__VERSECRAFT_FINAL__:".length);
    return { raw, sawNonEmptyData: true };
  }
  raw += joined;
  return { raw, sawNonEmptyData: true };
}
