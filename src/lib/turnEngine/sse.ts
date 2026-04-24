import { VERSECRAFT_REQUEST_ID_RESPONSE_HEADER } from "@/lib/telemetry/requestId";
import type { StatusFrameStage } from "@/lib/turnEngine/types";

export function encodeSseEventPayload(data: string): string {
  const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const fields = lines.map((line) => `data: ${line}`);
  return `${fields.join("\n")}\n\n`;
}

export function sse(data: string): Uint8Array {
  return new TextEncoder().encode(encodeSseEventPayload(data));
}

export function sseText(data: string): string {
  return encodeSseEventPayload(data);
}

export function buildSseHeaders(requestId: string, extras?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
    ...(extras ?? {}),
  };
}

export function createSseResponse(args: {
  requestId: string;
  payload: string;
  status?: number;
  extras?: Record<string, string>;
}): Response {
  return new Response(sseText(args.payload), {
    status: args.status ?? 200,
    headers: buildSseHeaders(args.requestId, args.extras),
  });
}

export function buildStatusFramePayload(args: {
  stage: StatusFrameStage;
  message: string;
  requestId: string;
  at?: number;
}): string {
  return `__VERSECRAFT_STATUS__:${JSON.stringify({
    stage: args.stage,
    message: args.message,
    requestId: args.requestId,
    at: args.at ?? Date.now(),
  })}`;
}
