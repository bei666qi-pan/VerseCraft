// src/lib/ai/types/routingErrors.ts

export type AiFailureKind =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "UPSTREAM_5XX"
  | "HTTP_4XX_AUTH"
  | "HTTP_4XX_OTHER"
  | "NETWORK"
  | "JSON_PARSE"
  | "EMPTY_CONTENT"
  | "STREAM_INTERRUPTED"
  | "CIRCUIT_SKIP"
  | "ABORTED"
  | "UNKNOWN";

export type AiFailureSeverity = "hard" | "soft";
