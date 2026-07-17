export type BugCohortDisposition =
  | "reproduced_current"
  | "guard_observed_current"
  | "historical_not_observed_in_current_sample";

export function classifyBugCohort(args: {
  currentCount: number;
  currentActionableCount: number;
}): BugCohortDisposition {
  if (args.currentActionableCount > 0) return "reproduced_current";
  if (args.currentCount > 0) return "guard_observed_current";
  return "historical_not_observed_in_current_sample";
}
