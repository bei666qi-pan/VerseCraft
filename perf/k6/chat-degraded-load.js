import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: Number(__ENV.K6_VUS || 3),
  duration: __ENV.K6_DURATION || "20s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
    checks: ["rate>0.99"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:666";

export default function chatDegradedLoad() {
  const res = http.post(
    `${BASE_URL}/api/chat`,
    JSON.stringify({
      latestUserInput: "我观察走廊尽头。",
      messages: [{ role: "user", content: "我观察走廊尽头。" }],
      playerContext: "{}",
      sessionId: `k6-degraded-${__VU}-${__ITER}`,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
    }
  );
  check(res, {
    "status is 200": (r) => r.status === 200,
    "keys missing header": (r) => String(r.headers["X-Versecraft-Ai-Status"] || r.headers["X-VerseCraft-Ai-Status"] || "").toLowerCase() === "keys_missing",
    "final frame exists": (r) => String(r.body || "").includes("__VERSECRAFT_FINAL__:"),
  });
}
