import { env } from "@/lib/env";
import { sanitizeInputText } from "@/lib/security/helpers";
import { localRulesProvider } from "@/lib/security/providers/localRules";
import { callVolcengineModeration } from "@/lib/security/providers/volcengine/client";
import { normalizeVolcengineResult } from "@/lib/security/providers/volcengine/normalize";
import type { ModerationContext, ModerationProvider, ModerationResult } from "@/lib/security/types";

function hasVolcengineSafetyConfig(): boolean {
  return Boolean(
    env.volcengineSafetyEndpoint &&
      env.volcengineSafetyApiKey &&
      env.volcengineSafetyApiSecret &&
      env.volcengineSafetyAppId &&
      env.volcengineSafetyRegion
  );
}

export const volcengineProvider: ModerationProvider = {
  name: "volcengine",
  async moderate(input: string, context: ModerationContext): Promise<ModerationResult> {
    const sanitized = sanitizeInputText(input, 6000);
    if (!hasVolcengineSafetyConfig()) {
      console.info("[security][volcengine] credentials missing, fallback to local-rules");
      return localRulesProvider.moderate(sanitized, context);
    }
    const resp = await callVolcengineModeration(sanitized, context);
    if (!resp.ok) {
      console.warn("[security][volcengine] provider unavailable, fallback to local-rules", {
        status: resp.status,
        error: resp.error,
      });
      if (env.securityModerationFailOpen) {
        return localRulesProvider.moderate(sanitized, context);
      }
    }
    return normalizeVolcengineResult(resp, sanitized);
  },
};

export function canUseVolcengineProvider(): boolean {
  return hasVolcengineSafetyConfig();
}
