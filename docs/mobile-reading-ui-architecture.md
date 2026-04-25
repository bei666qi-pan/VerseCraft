# Mobile Reading UI Architecture

本文记录 `/play` 从旧组件接线到移动端阅读壳层的结构边界。目标是让后续 Codex 更容易定位、修改和测试 `/play` 全栈链路，而不是重写业务。

## 入口

- 页面入口：`src/app/play/page.tsx`
- 移动阅读壳层：`src/features/play/mobileReading/`
- 旧兼容组件：
  - `src/features/play/components/PlayReadingChrome.tsx`
  - `src/features/play/components/PlayTextInputBar.tsx`
  - `src/features/play/components/PlayOptionsList.tsx`

旧兼容组件暂时保留，只转发到新的 mobile reading 组件。不要在确认完全无用和测试覆盖充分前物理删除。

## 结构边界

`src/app/play/page.tsx` 仍负责：

- SSE 请求和响应解析
- `__VERSECRAFT_FINAL__` 最终帧接收后的回合提交
- `sendAction`、`onSubmit`、`onPickOption`
- `currentOptions`、`inputMode`、`activeMenu` 等 store 兼容字段接线
- guest gate、终局选项、职业认证、天赋业务效果
- `UnifiedMenuModal` 的图鉴 / 设置打开

`src/features/play/mobileReading/` 只负责移动端阅读壳层 UI：

- `MobileReadingShell`：页面阅读表面和 `mobile-reading-shell`；手机端使用 `100dvh`，桌面端居中限制为手机宽度，不让阅读壳层横向铺满。
- `MobileReadingHeader`：品牌、章节、音频按钮和 `mobile-reading-header`
- `MobileStoryViewport`：正文滚动区域外壳和 `mobile-story-viewport`
- `MobileActionDock`：底部输入胶囊、选项展开、发送按钮和 `mobile-action-dock`
- `EchoTalentButton`：天赋按钮和 `echo-talent-button`
- `MobileOptionsDropdown`：四条行动选项和 `mobile-options-dropdown` / `mobile-option-item`
- `MobileOptionsEmptyState`：无选项或选项再生成时的克制空状态，仍使用 `mobile-options-dropdown` 稳定选择器。
- `MobileBottomNav`：底部导航和 `mobile-bottom-nav`；`activeItem` 由 `/play` 的 `activeMenu` 映射，图鉴 / 设置打开时高亮对应入口，关闭后回到剧情高亮。
- `hooks/useMobileActionDock.ts`：输入栏局部 UI 状态，例如 submit flash、helper text、天赋按钮 label
- `theme.ts`：移动阅读页颜色、边框、间距、高度、安全区、阴影与组件 class token
- `icons.tsx`：移动阅读页专用 inline SVG 图标体系与六种回响天赋图标映射
- `types.ts`：壳层 props 类型

主题与图标边界：

- 截图级背景、暖金色、边框透明度、底栏高度、输入区高度、光晕、安全区 padding 等核心视觉值应先改 `mobileReadingTokens`。
- 壳层组件实际消费的 Tailwind class 应集中在 `mobileReadingTheme`，不要在多个组件里复制第二套主视觉值。
- 图标必须来自 `icons.tsx` 的自定义 SVG 组件，使用 `currentColor` 和统一线性描边；不要把移动阅读页再切回外部图标包。
- 新增回响天赋时，同时更新 `MOBILE_READING_TALENT_ICON_NAMES`、`MobileReadingTalentIcons` 和 `getMobileReadingTalentIcon()` 的映射。

## 交互边界

输入：

- `MobileActionDock` 接收 `input`、`onInputChange`、`onSubmitKey`、`onSubmitClick`。
- 它不读写 store，也不调用 `/api/chat`。
- 手动输入意图提示仍通过 `onTextIntent` 由 `page.tsx` 接线。

选项：

- `MobileOptionsDropdown` 只展示 `currentOptions` 的四槽位结果。
- 点击选项回到 `page.tsx` 的 `onPickOption`。
- 缺选项时由 `page.tsx` 的 `requestFreshOptions("manual_button")` 走既有 options regen 链路。

天赋：

- `EchoTalentButton` 只展示按钮和触发 `onUseTalent`。
- 天赋实际效果仍在 `page.tsx` 的 `onUseTalent` 中执行。

底部导航：

- `剧情`：收起选项，保留阅读态。
- `图鉴`：`setActiveMenu("codex")`，继续走 `UnifiedMenuModal`。
- `设置`：`setActiveMenu("settings")`，继续走 `UnifiedMenuModal`。
- `角色`：现阶段只保留视觉入口，`aria-label="角色，暂未开放"`，不跳转、不打开其它旧面板。

## 禁止事项

- 不要把 SSE 解析、final frame、回合提交、store mutation 塞进 mobile reading UI 组件。
- 不要绕过 `onPickOption` / `sendAction` 直接提交行动。
- 不要重新暴露任务栏、游戏指南、灵感手记、仓库、成就、武器的主动 UI 入口。
- 不要为贴近截图发明新玩法、新路由或新 store 字段。
- 不要破坏 `inputMode`、`currentOptions`、`activeMenu` 等旧字段兼容。

## 测试选择器

后续测试和 Browser Use 验证应优先使用这些稳定选择器：

- `mobile-reading-shell`
- `mobile-reading-header`
- `mobile-story-viewport`
- `mobile-action-dock`
- `echo-talent-button`
- `manual-action-input`
- `options-toggle-button`
- `send-action-button`
- `mobile-options-dropdown`
- `mobile-option-item`
- `mobile-bottom-nav`
- `bottom-nav-character`
- `bottom-nav-story`
- `bottom-nav-codex`
- `bottom-nav-settings`

## 推荐验证

- `npx eslint .`
- `pnpm test:unit`
- `pnpm exec playwright test e2e/mobile-reading-ui.spec.ts`
- 需要完整 UI 裁剪回归时，加跑：
  - `pnpm exec playwright test e2e/play.spec.ts e2e/ui-pruning-browser-verification.spec.ts e2e/mobile-reading-ui.spec.ts`
- 能使用 Browser Use 时，用 in-app browser 在 `390×844`、`393×852`、`430×932` 做折叠 / 展开态验证。

## Phase 7 收口审查（2026-04-25）

本阶段最终审查以 `8997ed8..HEAD` 作为移动阅读 UI 改造 diff 范围，并重新检查了结构、契约和测试稳定性。

确认未改动或未破坏的核心边界：

- 未改动 `src/app/api/chat/*`，`/api/chat` SSE / `__VERSECRAFT_FINAL__` 契约未被替换成假响应。
- 未改动 `src/store/useGameStore.ts` 的 persist、hydration、存档字段、任务 / 仓库 / 成就 / 武器 / 手记 / 指南底层逻辑。
- 未改动 `src/components/UnifiedMenuModal.tsx` 的 settings / codex 真实功能；移动底栏仍通过 `activeMenu="codex" | "settings"` 接入现有 modal。
- 未改动 `package.json`、`pnpm-lock.yaml`，没有引入外部 UI 框架、外部字体、外部图标包或图片资源。
- 没有新增多余路由；旧指南、手记、仓库、成就、武器、任务栏等路由仍按既有策略回到 `/play`。
- 旧功能内容和底层状态仍保留；被裁剪的是主动 UI 入口，不是 store/schema/service 能力。

当前移动阅读 UI 入口和接线：

- `/play` 的视觉主入口是 `src/app/play/page.tsx` 中的 `MobileReadingShell`。
- 壳层、header、正文 viewport、输入 dock、选项 dropdown、底栏、天赋按钮分别位于 `src/features/play/mobileReading/components/`。
- `theme.ts` 维护核心色彩、边框、阴影、高度、间距和 safe area token；`icons.tsx` 维护移动阅读页专用 inline SVG 图标；`hooks/useMobileActionDock.ts` 只处理输入 dock 的局部 UI 状态。
- `page.tsx` 仍负责 `sendAction`、`onPickOption`、`onUseTalent`、audio mute、`activeMenu`、guest gate、死亡 / 终局锁定、SSE 和 turn commit 主链路。
- `MobileActionDock`、`MobileOptionsDropdown`、`MobileBottomNav` 等组件只消费 props，不直接复制 SSE 或 store mutation 业务。

Phase 7 稳定性修复：

- `e2e/mobile-reading-ui.spec.ts` 的种子状态现在同时写入 root transient `currentOptions` 和 `saveSlots.main_slot.currentOptions`。
- 这样测试夹具与真实存档恢复路径一致，避免截图用例等待较久时 root 临时选项被页面补选项流程清空，导致展开态偶发空列表。

最终回归命令：

- `npx eslint .`：通过，0 errors / 145 warnings。warnings 来自既有源码和未跟踪 `.claude/worktrees`。
- `pnpm test:unit`：通过，987 pass。
- `pnpm exec playwright test e2e/play.spec.ts e2e/mobile-reading-ui.spec.ts`：通过，19 passed。
- `pnpm build`：通过。
- `pnpm test:ci`：通过；`db:check:optional` 在本地 PostgreSQL 未启动时按脚本设计跳过。
- `pnpm exec playwright test e2e/mobile-reading-ui.spec.ts`：最终复查通过，10 passed。

已知限制：

- 当前本机 Browser Use in-app browser 初始化失败，因为 node_repl 解析到 `D:\node\node.exe v22.17.1`，低于插件要求的 `>=22.22.0`。本阶段使用 Playwright Chromium 真实浏览器完成等价验证。
- 本地 PostgreSQL 未启动时，dev / Playwright 输出会出现 analytics / presence `ECONNREFUSED 127.0.0.1:5432` 噪声；相关 E2E 断言和 build 均通过。
