# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
VerseCraft (文界工坊) is a single-player browser-based text adventure game (Next.js 15 + React 19 + Tailwind CSS v4 + Zustand 5). All UI text is in Simplified Chinese. The project uses PostgreSQL + Drizzle for account/session and server data, while gameplay state remains client-first persisted via IndexedDB (`idb-keyval`).

### Environment configuration
- **Single source**: server vars validated in `src/lib/config/serverConfig.ts`; raw reads only via `src/lib/config/envRaw.ts`. AI vars: `src/lib/ai/config/env.ts`. Public (browser): `src/lib/config/publicRuntime.ts` (`NEXT_PUBLIC_*` only).
- **Templates**: `.env.example`, `docs/environment.md`. Local = `.env.local`; production = Coolify env panel (same keys).

### Key dev commands
See `package.json` scripts. Summary:
- `pnpm dev` — dev server on **port 666** (`next dev --webpack -p 666`; production/Docker still listens on `3000`)
- `pnpm build` — production build
- `pnpm test:unit` — Node test runner over `src/**/*.test.ts` (AI routing, env, providers, stream fallback mock)
- `pnpm test:e2e:chat` — Playwright `/api/chat` SSE contract (`e2e/chat-sse-contract.spec.ts`)
- `pnpm test:e2e:contract` — CI 同款：`chat-sse-contract` + `play-open`（无网关时期望 `keys_missing` 降级 SSE）
- `pnpm test:ci` — eslint + unit + production build（与 `ci.yml` 前半段一致；完整 verify job 另含 Playwright，见 `ci.yml`）
- `pnpm run ship -- "feat: 说明"` — 跨平台调用 `node deploy.sh`（**勿**使用 `bash ./deploy.sh`：`deploy.sh` 为 Node 脚本，在无 bash 的 Windows 上会失败；勿单独用 `pnpm deploy`，会与 pnpm 内置命令冲突）
- `pnpm verify:ai-gateway` / `pnpm probe:ai-gateway` — 网关配置检查 / 极小连通探测
- `npx eslint .` — lint (**`pnpm lint` / `next lint` does not work in Next.js 16 CLI**; use `npx eslint .` directly)

### Non-obvious caveats
- **PostCSS is required**: Tailwind v4 needs `postcss.config.mjs` with `@tailwindcss/postcss` plugin. Without it, CSS compiles to nothing and pages render as bare HTML skeletons.
- **Turbopack CSS path**: Production builds place CSS in `.next/static/chunks/*.css` (not `.next/static/css/`). This is expected Turbopack behavior.
- **AI gateway (one-api)**: `/api/chat` routes through `src/lib/ai` using a single OpenAI-compatible endpoint. Configure `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, and `AI_MODEL_*` role names (see `.env.example` / `docs/ai-architecture.md`). Legacy vendor keys are no longer read by default.
- **Docker build**: `sudo dockerd` must be started first in Cloud Agent VMs. Use `sudo docker build -t versecraft:v1 .` to build and `sudo docker run -d -p 3000:3000 versecraft:v1` to run. Remember to free port 3000 before starting the container.
- **Port 666 requires root**: The default `pnpm dev` listens on port 666 which requires elevated privileges. In Cloud Agent VMs, use `npx next dev --webpack -p 3000` instead or run with sudo.
- **System `DATABASE_URL` takes precedence**: Next.js does not override env vars already set in the shell. If a `DATABASE_URL` secret is injected at the VM level, `.env.local` values for that key are ignored. Start Docker PostgreSQL with matching credentials (user/password/db parsed from the injected `DATABASE_URL`) or unset the system var before starting the dev server.
- **Database auto-migration**: `scripts/migrate.js` runs the base schema; `pnpm db:push` (via drizzle-kit) syncs the Drizzle schema. Both must use the same `DATABASE_URL`. The `db-push.mjs` script loads `.env.local` via dotenv, but system-level env vars take precedence.
- **AI logical roles vs one-api model names**: App code uses roles `main` / `control` / `enhance` / `reasoner`; env vars `AI_MODEL_*` hold the strings sent to the gateway. **Feature code should call `@/lib/ai/logicalTasks` (e.g. `generateMainReply`, `parsePlayerIntent`)** rather than `executeChatCompletion` directly. Switch upstream models in one-api or by changing those env vars — not scattered in business logic. If you see "model not exist" from the gateway, fix the mapping in one-api or env.

---

## Architecture Redlines (架构绝对红线)

These rules are **non-negotiable**. Every future agent session must respect them.

### 1. Framework versions
- **Next.js 15** (App Router) + **React 19** + **Tailwind CSS v4** (CSS-first config via `@theme` in `globals.css`).
- Package manager: **pnpm 10+**. Lockfile: `pnpm-lock.yaml`.

### 2. Next.js 15+ async data access
In the App Router, request-scoped APIs (`params`, `searchParams`, `cookies()`, `headers()`) are **asynchronous**. Always `await` them:
```ts
const { id } = await params;
const query = await searchParams;
```
Synchronous access will crash at runtime.

### 3. Zustand hydration defense
Zustand v5 stores using `persist` middleware **must** set `skipHydration: true` in the persist config. Rehydrate manually inside a `useEffect` on the client:
```ts
useEffect(() => {
  void Promise.resolve(useStore.persist.rehydrate()).then(() => {
    useStore.getState().setHydrated(true);
  });
}, []);
```
Render a skeleton/loader while `isHydrated === false`. **Never** use `useSyncExternalStore` for this.

### 3.1 Single store convention (play flow)
- Use **one unified store**: `src/store/useGameStore.ts`.
- Do not re-introduce `src/store/gameStore.ts` or split play state back into dual stores.
- Input mode / current options / active menu related state belongs to `useGameStore`.

### 3.2 Stream phase convention
- Play interaction lock and streaming visuals must be driven by explicit chat phases.
- Keep phase helpers centralized and avoid ad-hoc boolean scattering in page components.

### 3.3 Opening flow convention
- Opening must have **one primary chain** (main `/api/chat` request).
- Local fallback narrative is timeout-only degradation, and must never race-write against active SSE streaming.

### 3.4 Registration/session convention
- Registration success should establish server-side session directly.
- Do not add client-side “auto-login after register” workaround paths unless explicitly requested.

### 4. DeepSeek API message sanitization
Before sending multi-turn chat history to the DeepSeek endpoint, **strip `reasoning_content`** (chain-of-thought) from every message using `.map()`:
```ts
const safeMessages = messages.map(m => ({ role: m.role, content: m.content }));
```
Failing to do so triggers a **400 Bad Request** from the upstream API.

### 5. JSON output enforcement
When the system prompt requests structured JSON output from DeepSeek, it **must** include the literal Chinese string **"请严格以 JSON 格式输出"**. Without this, the model may produce infinite blank tokens or malformed output.
