import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import { openaiResponsesGateway } from "@/lib/ai/gateway/openaiResponses";
import type { ProviderRequestFactory } from "@/lib/ai/providers/types";
import type { ManagedTransport } from "@/lib/ai/managed/types";

/**
 * Returns the request factory that matches the given managed transport.
 * Caller passes the transport selected from the AI config snapshot so
 * that managed bindings using the Responses API get the Responses wire
 * shape, while bindings on the classic OpenAI-compatible transport keep
 * their existing behavior.
 */
export function getProviderFactory(transport?: ManagedTransport): ProviderRequestFactory {
  if (transport === "openai_responses") return openaiResponsesGateway;
  return openaiCompatibleGateway;
}
