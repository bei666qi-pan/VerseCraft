import type { ContentSafetyProvider, ModerationRequest, ModerationResult } from "@/lib/safety/types";

export class DisabledContentSafetyProvider implements ContentSafetyProvider {
  readonly name = "disabled";

  async moderateText(req: ModerationRequest): Promise<ModerationResult> {
    return {
      decision: "allow",
      riskLevel: "normal",
      categories: ["none"],
      score: 0,
      reasonCode: "provider_disabled",
      evidence: {
        provider: this.name,
        traceId: req.traceId,
      },
    };
  }
}

