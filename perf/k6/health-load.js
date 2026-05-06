import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: Number(__ENV.K6_VUS || 5),
  duration: __ENV.K6_DURATION || "20s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:666";

export default function healthLoad() {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    "health is 2xx": (r) => r.status >= 200 && r.status < 300,
  });
}
