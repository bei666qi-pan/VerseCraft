import type { DirectorValidationResult } from "./validator";

/** Intersects critic output with the deterministic accepted set. */
export function applySubtractiveCriticDecision(
  validation: DirectorValidationResult,
  decision: { accept: boolean; accepted_event_codes: string[]; reject_reasons: string[] },
): DirectorValidationResult {
  if (!decision.accept) {
    return {
      accepted: false,
      acceptedEventCodes: [],
      rejectedEventCodes: Array.from(new Set([
        ...validation.rejectedEventCodes,
        ...validation.acceptedEventCodes,
      ])),
      acceptedSocialEventCodes: [],
      rejectedSocialEventCodes: Array.from(new Set([
        ...validation.rejectedSocialEventCodes,
        ...validation.acceptedSocialEventCodes,
      ])),
      issues: [
        ...validation.issues,
        ...decision.reject_reasons.map((reason) => ({
          code: "critic_reject",
          message: reason,
          severity: "high" as const,
        })),
      ],
    };
  }

  const criticAccepted = new Set(decision.accepted_event_codes);
  const acceptedEventCodes = validation.acceptedEventCodes.filter((code) => criticAccepted.has(code));
  return {
    ...validation,
    acceptedEventCodes,
    rejectedEventCodes: Array.from(new Set([
      ...validation.rejectedEventCodes,
      ...validation.acceptedEventCodes.filter((code) => !criticAccepted.has(code)),
    ])),
  };
}
