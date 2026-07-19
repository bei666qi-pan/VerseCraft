export type DirectorEvidenceStage =
  | "preflight"
  | "enqueued"
  | "worker"
  | "reasoner_run"
  | "agenda"
  | "director_state"
  | "consumer";

export type DirectorEvidenceResult = {
  stage: DirectorEvidenceStage;
  status: "pass" | "blocked" | "fail";
  detail: string;
};

export type DirectorLiveEvidenceSummary = {
  status: "pass" | "blocked" | "fail";
  missingStages: DirectorEvidenceStage[];
  results: DirectorEvidenceResult[];
};

const REQUIRED_STAGES: readonly DirectorEvidenceStage[] = [
  "preflight",
  "enqueued",
  "worker",
  "reasoner_run",
  "agenda",
  "director_state",
  "consumer",
];

/** A live director claim is valid only when every asynchronous hop is evidenced. */
export function summarizeDirectorLiveEvidence(results: DirectorEvidenceResult[]): DirectorLiveEvidenceSummary {
  const byStage = new Map(results.map((result) => [result.stage, result]));
  const missingStages = REQUIRED_STAGES.filter((stage) => byStage.get(stage)?.status !== "pass");
  if (missingStages.length === 0) return { status: "pass", missingStages, results };
  const blocked = missingStages.some((stage) => byStage.get(stage)?.status === "blocked");
  return { status: blocked ? "blocked" : "fail", missingStages, results };
}
