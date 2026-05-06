import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: Number(__ENV.K6_VUS || 3),
  duration: __ENV.K6_DURATION || "20s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
    checks: ["rate>0.99"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:666";

export default function chatMockLoad() {
  const body = JSON.stringify({
    latestUserInput: "我贴着墙根听走廊尽头的动静。",
    messages: [{ role: "user", content: "我贴着墙根听走廊尽头的动静。" }],
    playerContext: "{}",
    sessionId: `k6-mock-${__VU}-${__ITER}`,
  });
  const res = http.post(`${BASE_URL}/api/chat`, body, {
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-VerseCraft-Request-Id": `k6-mock-${__VU}-${__ITER}`,
    },
  });
  check(res, {
    "status is 200": (r) => r.status === 200,
    "content type is sse": (r) => String(r.headers["Content-Type"] || "").includes("text/event-stream"),
    "final frame exists": (r) => String(r.body || "").includes("__VERSECRAFT_FINAL__:"),
  });
}
