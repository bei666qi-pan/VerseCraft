# NPC Codex Portraits

暗月 NPC 图鉴头像统一存放于 `public/assets/npc-avatars/`，以 NPC ID 命名。

- `N-001.png` 至 `N-045.png`：PNG 兜底图。
- `N-xxx@1x|2x|3x.avif`：96 / 192 / 288 像素宽的 AVIF 响应式资源。
- `N-xxx@1x|2x|3x.webp`：96 / 192 / 288 像素宽的 WebP 响应式资源。

新增或替换头像后运行 `pnpm images:optimize`，保持各密度档位同步。

后续补图建议：

- 文件名：`N-008.webp`
- 比例：竖版 `3:4` 或 `4:5`
- 路径：`public/images/codex/npc/N-008.webp`
- 配置入口：`src/features/play/mobileReading/codexPortraits.ts`
