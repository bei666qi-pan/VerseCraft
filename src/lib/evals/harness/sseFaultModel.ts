import { VERSECRAFT_FINAL_PREFIX, VERSECRAFT_STATUS_PREFIX } from "@/lib/turnEngine/sse";

export type SseFaultParseResult = {
  finalJson: Record<string, unknown> | null;
  aiStatus?: string;
  visibleText: string;
  finalFrameCount: number;
  malformedFinalCount: number;
};

/**
 * Incremental SSE decoder used by the low-cost fault matrix and live harness.
 * It intentionally models arbitrary TCP chunk boundaries and CRLF proxies.
 */
export class IncrementalVerseCraftSseDecoder {
  private buffer = "";
  private readonly decoder = new TextDecoder();
  private result: SseFaultParseResult = {
    finalJson: null,
    visibleText: "",
    finalFrameCount: 0,
    malformedFinalCount: 0,
  };

  push(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    this.drain(false);
  }

  finish(): SseFaultParseResult {
    this.buffer += this.decoder.decode();
    this.drain(true);
    return { ...this.result };
  }

  /** Whether this decoder has already captured a __VERSECRAFT_FINAL__ frame. */
  get hasFinal(): boolean {
    return this.result.finalFrameCount > 0;
  }

  private drain(flush: boolean): void {
    this.buffer = this.buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary >= 0) {
      this.consume(this.buffer.slice(0, boundary));
      this.buffer = this.buffer.slice(boundary + 2);
      boundary = this.buffer.indexOf("\n\n");
    }
    if (flush && this.buffer.trim()) {
      // An unterminated event is a truncated transport frame and must not commit.
      this.buffer = "";
    }
  }

  private consume(event: string): void {
    const dataLines = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    if (payload.startsWith(VERSECRAFT_STATUS_PREFIX)) {
      try {
        const status = JSON.parse(payload.slice(VERSECRAFT_STATUS_PREFIX.length)) as Record<string, unknown>;
        if (typeof status.aiStatus === "string") this.result.aiStatus = status.aiStatus;
      } catch { /* malformed status is non-authoritative */ }
      return;
    }
    if (payload.startsWith(VERSECRAFT_FINAL_PREFIX)) {
      this.result.finalFrameCount += 1;
      try {
        this.result.finalJson = JSON.parse(payload.slice(VERSECRAFT_FINAL_PREFIX.length)) as Record<string, unknown>;
      } catch {
        this.result.malformedFinalCount += 1;
      }
      return;
    }
    if (!payload.startsWith("__VERSECRAFT_")) this.result.visibleText += payload;
  }
}

export function decodeVerseCraftSseChunks(chunks: Uint8Array[]): SseFaultParseResult {
  const decoder = new IncrementalVerseCraftSseDecoder();
  for (const chunk of chunks) decoder.push(chunk);
  return decoder.finish();
}
