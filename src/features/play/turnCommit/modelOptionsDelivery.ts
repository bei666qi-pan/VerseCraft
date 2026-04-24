export const REQUIRED_MODEL_OPTION_COUNT = 4;

export type ModelOptionsDeliveryDecision =
  | { action: "commit"; options: string[] }
  | { action: "repair"; seedOptions: string[]; missingCount: number }
  | { action: "clear" };

export function decideModelOptionsDelivery(args: {
  options: string[];
  requiredCount?: number;
}): ModelOptionsDeliveryDecision {
  const requiredCount = Math.max(
    1,
    Math.min(REQUIRED_MODEL_OPTION_COUNT, Math.trunc(Number(args.requiredCount ?? REQUIRED_MODEL_OPTION_COUNT)))
  );
  const options = (Array.isArray(args.options) ? args.options : [])
    .map((option) => String(option ?? "").trim())
    .filter((option) => option.length > 0)
    .slice(0, requiredCount);

  if (options.length === requiredCount) {
    return { action: "commit", options };
  }
  if (options.length > 0) {
    return { action: "repair", seedOptions: options, missingCount: requiredCount - options.length };
  }
  return { action: "clear" };
}
