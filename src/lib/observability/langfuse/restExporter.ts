// src/lib/observability/langfuse/restExporter.ts
// Custom OTel SpanExporter that sends JSON to Langfuse REST ingestion API.
// All spans in a trace share the same traceId — sent in a single batch.
import "server-only";

import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
type ExportResult = { code: number; error?: Error };

const INGESTION_ENDPOINT = "/api/public/ingestion";
const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH_SIZE = 50;

interface BatchItem {
  id: string;
  type: string;
  timestamp: string;
  body: Record<string, unknown>;
}

function hrtimeToISO(seconds: number, nanos: number): string {
  return new Date(seconds * 1000 + nanos / 1e6).toISOString();
}

function parseAttr(attrs: Record<string, unknown> | undefined, key: string): unknown {
  const val = attrs?.[key];
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

export class VerseCraftSpanExporter {
  private _baseUrl: string;
  private _authHeader: string;
  private _buffer: ReadableSpan[] = [];
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _shutdown = false;

  constructor(params: {
    publicKey: string;
    secretKey: string;
    baseUrl: string;
  }) {
    this._baseUrl = params.baseUrl.replace(/\/$/, "");
    this._authHeader = "Basic " + Buffer.from(`${params.publicKey}:${params.secretKey}`).toString("base64");
    this._scheduleFlush();
  }

  private _scheduleFlush(): void {
    if (this._shutdown) return;
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this._doFlush(), FLUSH_INTERVAL_MS);
  }

  private async _doFlush(): Promise<void> {
    if (this._buffer.length === 0) {
      this._scheduleFlush();
      return;
    }

    const spans = this._buffer.splice(0);

    // Group spans by traceId, filtering out exporter's own ingestion HTTP calls.
    // These "fetch POST .../api/public/ingestion" spans are OTel-instrumented
    // HTTP calls created by the exporter itself — a feedback loop if not excluded.
    const byTrace = new Map<string, ReadableSpan[]>();
    for (const s of spans) {
      if (s.name.includes("/api/public/ingestion")) continue;
      const tid = s.spanContext().traceId;
      if (!byTrace.has(tid)) byTrace.set(tid, []);
      byTrace.get(tid)!.push(s);
    }

    if (byTrace.size === 0) {
      this._scheduleFlush();
      return;
    }

    // Send each trace as a single batch (trace auto-created by Langfuse)
    for (const [traceId, traceSpans] of byTrace) {
      const batch: BatchItem[] = [];

      // Prefer our versecraft.chat.turn span for trace naming and root id;
      // fall back to earliest span (auto-instrumented HTTP spans may be earlier).
      const turnSpan = traceSpans.find((s) => s.name === "versecraft.chat.turn");
      const nameSpan = turnSpan ?? [...traceSpans].sort((a, b) => {
        const aMs = Number(a.startTime[0]) * 1000 + Number(a.startTime[1]) / 1e6;
        const bMs = Number(b.startTime[0]) * 1000 + Number(b.startTime[1]) / 1e6;
        return aMs - bMs;
      })[0];
      const firstStartTime = hrtimeToISO(Number(nameSpan.startTime[0]), Number(nameSpan.startTime[1]));
      // Use versecraft.chat.turn as trace name when available; it carries domain semantics
      const traceName = turnSpan ? "versecraft.chat.turn" : nameSpan.name;
      batch.push({
        id: nameSpan.spanContext().spanId,
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: traceId,
          name: traceName,
          timestamp: firstStartTime,
          userId: typeof nameSpan.attributes?.["langfuse.user.id"] === "string"
            ? (nameSpan.attributes["langfuse.user.id"] as string) : undefined,
          sessionId: typeof nameSpan.attributes?.["langfuse.session.id"] === "string"
            ? (nameSpan.attributes["langfuse.session.id"] as string)
            : typeof nameSpan.attributes?.["langfuse.observation.session_id"] === "string"
              ? (nameSpan.attributes["langfuse.observation.session_id"] as string) : undefined,
          metadata: parseAttr(nameSpan.attributes, "langfuse.observation.metadata") || {},
        },
      });

      // All observations (spans + generations), including the root span.
      // Parent-child linking via parentSpanContext from OTel, propagated by
      // @langfuse/tracing's startObservation() call chain.
      for (const span of traceSpans) {
        const sid = span.spanContext().spanId;
        const parentObsId = span.parentSpanContext?.spanId;

        const rawType = typeof span.attributes?.["langfuse.observation.type"] === "string"
          ? (span.attributes["langfuse.observation.type"] as string).toUpperCase()
          : span.name.startsWith("ai.") ? "GENERATION" : "SPAN";
        const isGen = rawType === "GENERATION";
        const startTime = hrtimeToISO(Number(span.startTime[0]), Number(span.startTime[1]));
        const endTime = span.endTime
          ? hrtimeToISO(Number(span.endTime[0]), Number(span.endTime[1]))
          : new Date().toISOString();

        if (isGen) {
          batch.push({
            id: sid,
            type: "generation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: sid,
              traceId,
              name: span.name,
              startTime,
              endTime,
              ...(parentObsId ? { parentObservationId: parentObsId } : {}),
              model: typeof span.attributes?.["langfuse.observation.model.name"] === "string"
                ? (span.attributes["langfuse.observation.model.name"] as string) : undefined,
              input: typeof span.attributes?.["langfuse.observation.input"] === "string"
                ? (span.attributes["langfuse.observation.input"] as string) : undefined,
              output: typeof span.attributes?.["langfuse.observation.output"] === "string"
                ? (span.attributes["langfuse.observation.output"] as string) : undefined,
              usage: parseAttr(span.attributes, "langfuse.observation.usage_details") || undefined,
              metadata: parseAttr(span.attributes, "langfuse.observation.metadata") || {},
            },
          });
        } else {
          batch.push({
            id: sid,
            type: "span-create",
            timestamp: new Date().toISOString(),
            body: {
              id: sid,
              traceId,
              name: span.name,
              startTime,
              endTime,
              ...(parentObsId ? { parentObservationId: parentObsId } : {}),
              metadata: parseAttr(span.attributes, "langfuse.observation.metadata") || {},
            },
          });
        }
      }

      try {
        const res = await fetch(`${this._baseUrl}${INGESTION_ENDPOINT}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: this._authHeader,
          },
          body: JSON.stringify({ batch }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "unknown");
          console.error(`[langfuse] REST export failed: ${res.status} ${text.slice(0, 300)}`);
        }
      } catch (err) {
        console.error("[langfuse] REST export error", err instanceof Error ? err.message : String(err));
      }
    }

    this._scheduleFlush();
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this._shutdown) { resultCallback({ code: 0 }); return; }
    this._buffer.push(...spans);
    if (this._buffer.length >= MAX_BATCH_SIZE) {
      if (this._flushTimer) clearTimeout(this._flushTimer);
      this._doFlush().catch(() => {});
    }
    resultCallback({ code: 0 });
  }

  shutdown(): Promise<void> {
    this._shutdown = true;
    if (this._flushTimer) clearTimeout(this._flushTimer);
    return this._doFlush();
  }

  forceFlush(): Promise<void> {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    return this._doFlush();
  }
}
