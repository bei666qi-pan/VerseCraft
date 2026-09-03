## 1. Recovery guard

- [x] 1.1 Extract a pure classifier for retryable stale queue-ticket rejections and cover recognized and rejected reasons.
- [x] 1.2 In `/play`, clear persisted queue state and make one fresh admission only for a restored action that matches the classifier before SSE content exists.
- [x] 1.3 Extend the same one-time recovery to a newly admitted ticket that is explicitly rejected as missing/terminal before model execution.

## 2. Verification

- [x] 2.1 Add regression coverage for one retry, no duplicate player log, and no retry for unrelated 409/model failures.
- [x] 2.2 Run targeted tests, lint, OpenSpec strict validation, and local browser `/play` recovery verification.
