import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import type { ProviderRequestFactory } from "@/lib/ai/providers/types";

export function getProviderFactory(): ProviderRequestFactory {
  return openaiCompatibleGateway;
}
