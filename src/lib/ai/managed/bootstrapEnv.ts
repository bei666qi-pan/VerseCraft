type BootstrapEnvironment = Readonly<Record<string, string | undefined>>;

export type ManagedBootstrapGenerationConfig = Readonly<{
  serviceId: "environment-generation";
  serviceName: "Environment managed generation";
  modelId: "environment-generation-model";
  baseUrl: string;
  apiKey: string;
  model: string;
  transport: "openai_compatible";
}>;

function text(environment: BootstrapEnvironment, key: string): string {
  return String(environment[key] ?? "").trim();
}

/**
 * Resolve the legacy environment only during first-boot migration into the
 * managed AI tables. Runtime routing continues to read only managed state.
 */
export function resolveManagedBootstrapGenerationConfig(
  environment: BootstrapEnvironment,
): ManagedBootstrapGenerationConfig | null {
  const apiKey =
    text(environment, "VC_AI_DIRECT_API_KEY") ||
    text(environment, "AI_GATEWAY_API_KEY") ||
    text(environment, "DEEPSEEK_API_KEY");
  const baseUrl =
    text(environment, "VC_AI_DIRECT_BASE_URL") ||
    text(environment, "AI_GATEWAY_BASE_URL") ||
    (text(environment, "DEEPSEEK_API_KEY") ? "https://api.deepseek.com" : "");
  const model =
    text(environment, "VC_AI_DIRECT_MODEL") ||
    text(environment, "AI_MODEL_MAIN") ||
    text(environment, "AI_DEFAULT_MODEL") ||
    (text(environment, "DEEPSEEK_API_KEY") ? "deepseek-chat" : "");

  if (!apiKey || !baseUrl || !model) return null;
  return {
    serviceId: "environment-generation",
    serviceName: "Environment managed generation",
    modelId: "environment-generation-model",
    baseUrl,
    apiKey,
    model,
    transport: "openai_compatible",
  };
}
