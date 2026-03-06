# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
VerseCraft (文界工坊) is a single-player browser-based text adventure game (Next.js 15 + React 19 + Tailwind CSS v4 + Zustand 5). All UI text is in Simplified Chinese. There is no database — state is persisted client-side via IndexedDB (`idb-keyval`).

### Key dev commands
See `package.json` scripts. Summary:
- `pnpm dev` — dev server with Turbopack on port 3000
- `pnpm build` — production build
- `npx eslint .` — lint (**`pnpm lint` / `next lint` does not work in Next.js 16 CLI**; use `npx eslint .` directly)

### Non-obvious caveats
- **PostCSS is required**: Tailwind v4 needs `postcss.config.mjs` with `@tailwindcss/postcss` plugin. Without it, CSS compiles to nothing and pages render as bare HTML skeletons.
- **Turbopack CSS path**: Production builds place CSS in `.next/static/chunks/*.css` (not `.next/static/css/`). This is expected Turbopack behavior.
- **Volcengine API key is optional**: The `/api/chat` SSE endpoint requires `VOLCENGINE_API_KEY` (or `ARK_API_KEY` / `DEEPSEEK_API_KEY`). Without it the game UI still loads but action submission returns a graceful error. Set keys in `.env.local` if needed.
- **Docker build**: `sudo dockerd` must be started first in Cloud Agent VMs. Use `sudo docker build -t versecraft:v1 .` to build and `sudo docker run -d -p 3000:3000 versecraft:v1` to run. Remember to free port 3000 before starting the container.

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

### 4. DeepSeek API message sanitization
Before sending multi-turn chat history to the Volcengine DeepSeek endpoint, **strip `reasoning_content`** (chain-of-thought) from every message using `.map()`:
```ts
const safeMessages = messages.map(m => ({ role: m.role, content: m.content }));
```
Failing to do so triggers a **400 Bad Request** from the upstream API.

### 5. JSON output enforcement
When the system prompt requests structured JSON output from DeepSeek, it **must** include the literal Chinese string **"请严格以 JSON 格式输出"**. Without this, the model may produce infinite blank tokens or malformed output.
