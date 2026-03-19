export type VolcengineRawDecision = "allow" | "review" | "block";

export type VolcengineRawResult = {
  decision: VolcengineRawDecision;
  score?: number;
  labels?: string[];
  reason?: string;
  requestId?: string;
};

export type VolcengineClientResponse = {
  ok: boolean;
  status: number;
  providerRequestId?: string;
  result?: VolcengineRawResult;
  error?: string;
};
