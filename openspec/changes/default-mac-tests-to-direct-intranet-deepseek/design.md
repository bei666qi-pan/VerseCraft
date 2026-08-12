## Context

The local Mac environment currently sends all application AI traffic to a helper process at `127.0.0.1:4319`. That helper historically pinned the aTrust-only Sangfor hostname to `10.6.192.170`, adapted the OpenAI-compatible API, and recorded usage, but it is no longer reliably installed or running. A direct authenticated probe from this workspace to `https://aigateway.sangfor.com/v1/chat/completions` succeeds while aTrust is connected.

## Goals / Non-Goals

**Goals:**

- Make ordinary `pnpm dev` and live evaluation use the enterprise DeepSeek gateway without starting a loopback helper.
- Keep player turns on the low-latency Flash model with thinking disabled.
- Keep credentials only in ignored local configuration and preserve existing production routing.
- Retain the current SSE and structured-turn contracts under success and gateway failure.

**Non-Goals:**

- Removing the generic `VC_AI_DIRECT_*` override mechanism used by explicitly launched sessions.
- Changing production/Coolify routing, AI prompts, state validation, or model fallback policy.
- Replacing DeepSeek with the public official API when the corporate intranet is unavailable.
- Recreating the removed usage-ledger proxy inside VerseCraft.

## Decisions

1. **Use the corporate hostname directly.** Set local `AI_GATEWAY_BASE_URL=https://aigateway.sangfor.com/v1`; URL normalization already appends `/chat/completions`. This is preferable to hard-coding `10.6.192.170`, because TLS certificates and future routing remain hostname-based.
2. **Use the existing project-local gateway credential.** A real probe confirmed it is accepted by the corporate endpoint. No credential is copied into tracked files.
3. **Use a player-only model binding.** Set `VC_AI_DIRECT_PLAYER_MODEL=deepseek-v4-flash`; the existing resolver uses it only for gameplay tasks while the normal role map stays on `deepseek-v4-pro-202606` for offline/non-player work.
4. **Fail closed to the existing SSE degradation.** When aTrust is disconnected, do not fall back to public DeepSeek or another vendor. `/api/chat` retains its status/final degradation behavior, making the missing intranet route visible and auditable.
5. **Test resolver behavior rather than secrets.** Regression tests cover URL normalization and player-vs-role model selection with synthetic environment values.

## Risks / Trade-offs

- **aTrust is disconnected or DNS is unavailable** → `/api/chat` cannot reach the model; document the prerequisite and preserve the existing SSE failure response.
- **The corporate certificate or DNS route changes** → use the hostname rather than a pinned IP and keep the endpoint configurable in `.env.local`.
- **Direct calls lose local usage-ledger telemetry** → accept this as an explicit trade-off; application analytics and optional Langfuse remain available.
- **`VC_AI_DIRECT_*` injected by a parent process overrides `.env.local`** → this remains intentional for explicit sessions; ordinary Terminal launches use the local direct corporate binding.

## Migration Plan

1. Update this Mac's ignored `.env.local` endpoint and player model.
2. Add synthetic configuration regression coverage and update local gateway documentation.
3. Run the focused AI environment tests and a minimal authenticated corporate-gateway probe.
4. Roll back by restoring the previous `.env.local` URL; no code, data, schema, or production migration is required.

## Open Questions

None. The corporate endpoint, model, credential acceptance, and aTrust route were verified before implementation.
