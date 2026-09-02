import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { probeManagedModel } from "./probe";

test("Responses service probe uses the /responses endpoint and Responses request body", async (t) => {
  let requestPath = "";
  let requestBody: Record<string, unknown> = {};
  const server = createServer((req, res) => {
    requestPath = req.url ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "resp_probe", model: "MiniMax-M3", output_text: "OK" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const result = await probeManagedModel({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: "test-key",
    transport: "openai_responses",
    model: { upstreamModel: "MiniMax-M3", capability: "generation" },
    timeoutMs: 10_000,
    allowLocalhost: true,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requestPath, "/v1/responses");
  assert.equal(requestBody.model, "MiniMax-M3");
  assert.equal(requestBody.input, "只回复 OK");
  assert.equal("messages" in requestBody, false);
});
