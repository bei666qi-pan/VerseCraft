## 1. Production incident regression

- [x] 1.1 Add a failing contract test for opening `options_regen_only` with assistant context but no historical user action
- [x] 1.2 Add a client options-only meta request and server semantic validation split while preserving normal empty-input rejection
- [x] 1.3 Preserve request/trace correlation and render an actionable options failure/retry state
- [x] 1.4 Add a single-brand-mark DOM contract and remove duplicate decorative header branding

## 2. Langfuse runtime acceptance

- [x] 2.1 Audit existing Langfuse modules and reconcile implementation status with the active integration change
- [x] 2.2 Implement a secret-safe Langfuse preflight with disabled, misconfigured and ready states
- [x] 2.3 Implement an explicit trace/score/flush integration probe and options-only terminal trace metadata
- [x] 2.4 Add unit tests and configuration/runbook documentation for Langfuse health and privacy

## 3. RAGAS-compatible evaluation loop

- [x] 3.1 Define versioned RAGAS-compatible cases and deterministic context precision/recall metrics
- [x] 3.2 Connect faithfulness and answer relevancy to existing controlled judge/embedding services with explicit unavailable states
- [x] 3.3 Add JSON/Markdown reports, thresholds, baseline comparison and optional Langfuse score upload
- [x] 3.4 Integrate RAGAS results into the non-mutating `eval:*` workflow and add golden tests

## 4. Real preview and release evidence

- [x] 4.1 Add a production-experience browser canary that asserts playable options, console/overlay health and a single brand mark
- [x] 4.2 Build and run a local production preview, then verify 390×844, 393×852 and 430×932 rendered paths
- [x] 4.3 Run relevant unit, SSE contract, play E2E, chat benchmark, lint and build checks
- [x] 4.4 Run frontend design review Mode 1 after the UI is runnable, apply verified corrections and recheck
- [x] 4.5 Document the incident response and release-readiness playbook for future test-pass/product-fail cases
