import { completionEndpoint } from "../src/lib/ai/managed/urlSafety.ts";
console.log("1:", completionEndpoint("https://ark.cn-beijing.volces.com/api/plan/v3", "openai_responses"));
console.log("2:", completionEndpoint("https://ark.cn-beijing.volces.com/api/plan/v3", undefined));
console.log("3:", completionEndpoint("https://ark.cn-beijing.volces.com/api/plan/v3"));
console.log("4:", completionEndpoint("https://ark.cn-beijing.volces.com/api/plan/v3/responses", "openai_responses"));
