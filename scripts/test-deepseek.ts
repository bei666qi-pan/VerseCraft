import { callDeepSeekCompletion } from "./src/lib/evals/liveProvider.js";

async function main() {
  const start = Date.now();
  const res = await callDeepSeekCompletion({
    messages: [{ role: "user", content: "用一个中文词打招呼" }],
    temperature: 0.7,
    maxTokens: 50,
  });
  console.log("Latency:", Date.now() - start, "ms");
  console.log("Response:", res.content.slice(0, 200));
  console.log("Model:", res.model);
  console.log("Usage:", res.usage);
}

main().catch(console.error);