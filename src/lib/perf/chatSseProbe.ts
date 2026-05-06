import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import { CHAT_LATENCY_BUDGET } from "@/lib/perf/waitingConfig";
import {
  VERSECRAFT_CONTROL_PREFIX,
  VERSECRAFT_FINAL_PREFIX,
  VERSECRAFT_STATUS_PREFIX,
} from "@/lib/turnEngine/sse";

export interface ChatSseProbeBody {
  latestUserInput: string;
  playerContext?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface ChatSseProbeRequest {
  baseUrl: string;
  body: ChatSseProbeBody;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ChatSseProbeMetrics {
  httpStatus: number;
  status: number;
  contentType: string;
  aiStatus: string;
  firstSseMs: number | null;
  firstStatusMs: number | null;
  firstVisibleTextMs: number | null;
  firstTokenMs: number | null;
  finalMs: number | null;
  statusFrameCount: number;
  finalFrameReceived: boolean;
  finalJsonParseSuccess: boolean;
  finalJson: unknown;
  narrativeChars: number;
  optionsCount: number;
  optionsQualityPass: boolean;
  longGapCount: number;
  maxInterChunkGapMs: number;
  bytesRead: number;
  contractPass: boolean;
  rawText: string;
  error: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

function extractNarrative(value: unknown): string {
  const root = asRecord(value);
  const narrative = root?.narrative;
  return typeof narrative === "string" ? narrative.trim() : "";
}

function extractOptions(value: unknown): string[] {
  const root = asRecord(value);
  return readStringArray(root?.options);
}

function parseDataEvents(buffer: string): string[] {
  const blocks = buffer.split(/\n\n/);
  const completeBlocks = blocks.slice(0, -1);
  return completeBlocks
    .map((block) =>
      block
        .split(/\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

function remainingBuffer(buffer: string): string {
  const idx = buffer.lastIndexOf("\n\n");
  return idx >= 0 ? buffer.slice(idx + 2) : buffer;
}

function maybeParseFinal(data: string): unknown | null {
  if (!data.startsWith(VERSECRAFT_FINAL_PREFIX)) return null;
  const raw = data.slice(VERSECRAFT_FINAL_PREFIX.length).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isVisibleData(data: string): boolean {
  if (!data) return false;
  if (data.startsWith(VERSECRAFT_CONTROL_PREFIX)) return false;
  if (data === "[DONE]") return false;
  return true;
}

export async function probeChatSse(request: ChatSseProbeRequest): Promise<ChatSseProbeMetrics> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(1_000, Math.trunc(request.timeoutMs ?? 70_000));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let response: Response | null = null;
  let rawText = "";
  let bytesRead = 0;
  let firstSseMs: number | null = null;
  let firstStatusMs: number | null = null;
  let firstVisibleTextMs: number | null = null;
  let finalMs: number | null = null;
  let statusFrameCount = 0;
  let finalJson: unknown = null;
  let finalJsonParseSuccess = false;
  let finalFrameReceived = false;
  let longGapCount = 0;
  let maxInterChunkGapMs = 0;
  let lastVisibleAt: number | null = null;
  let buffer = "";
  let error: string | null = null;

  try {
    response = await fetch(`${request.baseUrl.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers ?? {}),
      },
      body: JSON.stringify(request.body),
      signal: ac.signal,
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("missing_response_body");
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const now = Date.now();
      bytesRead += value.byteLength;
      const piece = decoder.decode(value, { stream: true });
      rawText += piece;
      buffer += piece.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const events = parseDataEvents(buffer);
      buffer = remainingBuffer(buffer);
      for (const data of events) {
        const elapsed = now - startedAt;
        if (firstSseMs === null) firstSseMs = elapsed;
        if (data.startsWith(VERSECRAFT_STATUS_PREFIX)) {
          statusFrameCount += 1;
          if (firstStatusMs === null) firstStatusMs = elapsed;
          continue;
        }
        if (data.startsWith(VERSECRAFT_FINAL_PREFIX)) {
          finalFrameReceived = true;
          finalMs = elapsed;
          const parsed = maybeParseFinal(data);
          finalJsonParseSuccess = parsed !== null;
          finalJson = parsed;
          continue;
        }
        if (isVisibleData(data)) {
          if (firstVisibleTextMs === null) firstVisibleTextMs = elapsed;
          if (lastVisibleAt !== null) {
            const gap = Math.max(0, now - lastVisibleAt);
            maxInterChunkGapMs = Math.max(maxInterChunkGapMs, gap);
            if (gap > CHAT_LATENCY_BUDGET.maxInterChunkGapWarnMs) longGapCount += 1;
          }
          lastVisibleAt = now;
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timer);
  }

  const narrative = extractNarrative(finalJson);
  const options = extractOptions(finalJson);
  const filteredOptions = filterNarrativeActionOptions(options, 4);
  const optionsQualityPass = options.length === 4 && filteredOptions.length === 4;
  const httpStatus = response?.status ?? 0;
  const contentType = response?.headers.get("content-type") ?? "";
  const aiStatus = response?.headers.get("x-versecraft-ai-status") ?? "";
  const contractPass =
    httpStatus === 200 &&
    contentType.includes("text/event-stream") &&
    finalFrameReceived &&
    finalJsonParseSuccess;

  return {
    httpStatus,
    status: httpStatus,
    contentType,
    aiStatus,
    firstSseMs,
    firstStatusMs,
    firstVisibleTextMs,
    firstTokenMs: firstVisibleTextMs,
    finalMs,
    statusFrameCount,
    finalFrameReceived,
    finalJsonParseSuccess,
    finalJson,
    narrativeChars: narrative.length,
    optionsCount: options.length,
    optionsQualityPass,
    longGapCount,
    maxInterChunkGapMs,
    bytesRead,
    contractPass,
    rawText,
    error,
  };
}
