# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
VerseCraft (文界工坊) is a single-player browser-based text adventure game (Next.js 16 + React 19 + Tailwind CSS v4 + Zustand). All UI text is in Simplified Chinese. There is no database — state is persisted client-side via IndexedDB (`idb-keyval`).

### Key dev commands
See `package.json` scripts. Summary:
- `pnpm dev` — dev server with Turbopack on port 3000
- `pnpm build` — production build
- `npx eslint .` — lint (**`pnpm lint` / `next lint` does not work in Next.js 16**; use `npx eslint .` directly)

### Non-obvious caveats
- **PostCSS is required**: Tailwind v4 needs `postcss.config.mjs` with `@tailwindcss/postcss` plugin. Without it, CSS compiles to nothing and pages render as bare HTML skeletons.
- **Turbopack CSS path**: Production builds place CSS in `.next/static/chunks/*.css` (not `.next/static/css/`). This is expected Turbopack behavior.
- **Volcengine API key is optional**: The `/api/chat` SSE endpoint requires `VOLCENGINE_API_KEY` (or `ARK_API_KEY` / `DEEPSEEK_API_KEY`). Without it the game UI still loads but action submission returns a graceful error. Set keys in `.env.local` if needed.
- **Docker build**: `sudo dockerd` must be started first in Cloud Agent VMs. Use `sudo docker build -t versecraft:v1 .` to build and `sudo docker run -d -p 3000:3000 versecraft:v1` to run. Remember to free port 3000 before starting the container.
