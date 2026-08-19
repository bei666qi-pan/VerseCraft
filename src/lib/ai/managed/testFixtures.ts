import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { completionEndpoint, embeddingEndpoint } from "./urlSafety";
import { getManagedAiSnapshot, setManagedAiSnapshot } from "./state";
import type {
  AiPurpose,
  ManagedAiBinding,
  ManagedAiSnapshot,
  ManagedTransport,
} from "./types";

type LegacyRole = "writer" | "main" | "control" | "enhance" | "reasoner";

const ROLE_ENV: Record<LegacyRole, string> = {
  writer: "AI_MODEL_WRITER",
  main: "AI_MODEL_MAIN",
  control: "AI_MODEL_CONTROL",
  enhance: "AI_MODEL_ENHANCE",
  reasoner: "AI_MODEL_REASONER",
};

const PURPOSE_ROLES: Record<Exclude<AiPurpose, "embedding">, readonly LegacyRole[]> = {
  story: ["writer", "main", "control"],
  rules: ["control", "main"],
  polish: ["enhance", "main"],
  background: ["reasoner", "main", "control"],
  judge: ["reasoner", "main"],
};

function envText(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function binding(input: {
  purpose: AiPurpose;
  role: AiLogicalRole;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  transport?: ManagedTransport;
  embeddingDimension?: number | null;
  index: number;
}): ManagedAiBinding {
  const transport = input.transport ?? "openai_compatible";
  return Object.freeze({
    serviceId: `test-service-${input.purpose}-${input.index}`,
    serviceName: "test managed service",
    modelId: `test-model-${input.purpose}-${input.index}`,
    modelName: input.modelName,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    transport,
    purpose: input.purpose,
    logicalRole: input.role,
    embeddingDimension: input.embeddingDimension ?? null,
    inputPriceCnyFenPerMillion: null,
    outputPriceCnyFenPerMillion: null,
  });
}

/**
 * Bridge legacy env-shaped test cases onto the managed runtime fact source.
 * Production code never calls this helper.
 */
export function installManagedAiTestSnapshotFromEnv(): () => void {
  const previous = getManagedAiSnapshot();
  const mock = envText("AI_PROVIDER") === "mock" || envText("AI_GATEWAY_PROVIDER") === "mock";
  const chatBase = mock
    ? "mock://chat/completions"
    : completionEndpoint(envText("VC_AI_DIRECT_BASE_URL") || envText("AI_GATEWAY_BASE_URL"));
  const apiKey = mock
    ? "mock-key"
    : envText("VC_AI_DIRECT_API_KEY") || envText("AI_GATEWAY_API_KEY");
  const byPurpose: Record<AiPurpose, readonly ManagedAiBinding[]> = {
    story: [],
    rules: [],
    polish: [],
    background: [],
    judge: [],
    embedding: [],
  };

  for (const purpose of ["story", "rules", "polish", "background", "judge"] as const) {
    const rows: ManagedAiBinding[] = [];
    PURPOSE_ROLES[purpose].forEach((role, index) => {
      const explicit = envText(ROLE_ENV[role]);
      const modelName =
        explicit ||
        (mock ? `mock-${role}` : "");
      if (!modelName || !chatBase || !apiKey) return;
      rows.push(
        binding({
          purpose,
          role,
          modelName,
          baseUrl: chatBase,
          apiKey,
          // Test bindings deliberately bypass managed URL DNS validation; the
          // contract suites replace global fetch with non-resolving .test hosts.
          transport: "mock",
          index,
        })
      );
    });
    byPurpose[purpose] = Object.freeze(rows);
  }

  const embeddingProvider = envText("AI_EMBEDDING_PROVIDER") === "ark_multimodal"
    ? "ark_multimodal"
    : mock
      ? "mock"
      : "openai_compatible";
  const embeddingModel = envText("AI_MODEL_EMBEDDING") || (mock ? "mock-embedding" : "");
  const embeddingBase = embeddingProvider === "ark_multimodal"
    ? `${(envText("ARK_EMBEDDING_BASE_URL") || "https://ark.cn-beijing.volces.com").replace(/\/+$/, "")}/api/v3/embeddings/multimodal`
    : mock
      ? "mock://embeddings"
      : embeddingEndpoint(envText("AI_EMBEDDING_GATEWAY_BASE_URL") || envText("AI_GATEWAY_BASE_URL"), "openai_compatible");
  const embeddingKey = embeddingProvider === "ark_multimodal"
    ? envText("ARK_EMBEDDING_API_KEY")
    : mock
      ? "mock-key"
      : apiKey;
  if (embeddingModel && embeddingBase && embeddingKey) {
    byPurpose.embedding = Object.freeze([
      binding({
        purpose: "embedding",
        role: "reasoner",
        modelName: embeddingModel,
        baseUrl: embeddingBase,
        apiKey: embeddingKey,
        transport: embeddingProvider,
        embeddingDimension: Math.max(1, Number(process.env.AI_EMBEDDING_DIMENSION ?? 1024)),
        index: 0,
      }),
    ]);
  }

  const snapshot: ManagedAiSnapshot = Object.freeze({
    version: -1,
    loadedAt: Date.now(),
    ready: true,
    health: "ready",
    byPurpose: Object.freeze(byPurpose),
  });
  setManagedAiSnapshot(snapshot);
  return () => setManagedAiSnapshot(previous);
}
