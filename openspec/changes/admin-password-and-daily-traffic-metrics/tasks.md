## 1. Analytics data model and aggregation

- [x] 1.1 Add the `page_viewed` taxonomy/type and backward-compatible Beijing-day PV/UV schema table in Drizzle and both schema ensure paths.
- [x] 1.2 Implement pure web-traffic aggregation helpers and extend daily rebuild/upsert with idempotent Asia/Shanghai PV/UV totals.
- [x] 1.3 Expose daily web-traffic values in the authenticated admin overview with defined sources and day-over-day baselines.

## 2. Privacy-minimized collection

- [x] 2.1 Add the web-traffic rollout flag and an analytics endpoint that validates normalized path and anonymous visitor input before recording an idempotent event.
- [x] 2.2 Add a root-level client tracker that generates a stable anonymous browser visitor ID and sends best-effort navigation events without query/hash or internal-admin paths.

## 3. Quality assurance and release

- [x] 3.1 Add unit and route/contract tests for traffic normalization, flag-off behavior, Beijing-time aggregation, UV deduplication, and existing daily metrics compatibility.
- [x] 3.2 Run targeted tests, ESLint, OpenSpec validation, and a production build; document results.
- [ ] 3.3 Rotate the deployed `ADMIN_PASSWORD` to `panpan666`, deploy through the repository release workflow, and verify the new admin authentication plus dashboard traffic response.
