import assert from "node:assert/strict";
import test from "node:test";
import { resolveManagedBootstrapGenerationConfig } from "./bootstrapEnv";

test("managed bootstrap preserves an explicit MiniMax endpoint and model", () => {
  assert.deepEqual(
    resolveManagedBootstrapGenerationConfig({
      VC_AI_DIRECT_BASE_URL: "https://api.minimaxi.com/v1",
      VC_AI_DIRECT_API_KEY: "secret",
      VC_AI_DIRECT_MODEL: "MiniMax-M3",
    }),
    {
      serviceId: "environment-generation",
      serviceName: "Environment managed generation",
      modelId: "environment-generation-model",
      baseUrl: "https://api.minimaxi.com/v1",
      apiKey: "secret",
      model: "MiniMax-M3",
      transport: "openai_compatible",
    },
  );
});

test("managed bootstrap does not relabel a generic gateway key as Volcengine", () => {
  const config = resolveManagedBootstrapGenerationConfig({
    AI_GATEWAY_BASE_URL: "https://gateway.example/v1",
    AI_GATEWAY_API_KEY: "gateway-secret",
    AI_MODEL_MAIN: "writer-model",
  });
  assert.equal(config?.baseUrl, "https://gateway.example/v1");
  assert.equal(config?.model, "writer-model");
  assert.equal(config?.apiKey, "gateway-secret");
});

test("managed bootstrap remains disabled when the endpoint contract is incomplete", () => {
  assert.equal(resolveManagedBootstrapGenerationConfig({ AI_GATEWAY_API_KEY: "secret" }), null);
  assert.equal(resolveManagedBootstrapGenerationConfig({ AI_GATEWAY_BASE_URL: "https://gateway.example/v1" }), null);
});
