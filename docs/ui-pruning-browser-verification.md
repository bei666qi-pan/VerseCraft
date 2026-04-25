# UI Pruning Browser Verification

验证日期：2026-04-25

本报告记录“任务栏、游戏指南、灵感手记、仓库、成就、武器”从用户主动 UI 入口中移除后的浏览器验证结果。验证目标是确认这些功能不再通过按钮、菜单、tab、链接、快捷键、旧路由、移动端 dock 或可聚焦控件暴露，同时底层功能仍可由叙事触发。

## 启动方式

- 项目包管理器：`pnpm@10.0.0`，来自 `package.json`。
- 开发服务器命令：`pnpm dev`，对应 `next dev --webpack -p 666`。
- 浏览器验证优先使用项目已有 Playwright 配置，`playwright.config.ts` 通过 `webServer.command` 启动 `pnpm dev` 并访问 `http://127.0.0.1:666`。
- 未引入新的浏览器测试框架。

## 浏览器工具情况

用户显式要求使用 `@browser-use`。已按插件说明尝试调用 in-app browser 运行时，但当前本机 Node 运行时不满足插件要求：

```text
Node runtime too old for node_repl (resolved D:\node\node.exe): found v22.17.1, requires >= v22.22.0.
```

因此本阶段使用项目已有 Playwright Chromium 作为实际浏览器验证手段。该验证会真实启动浏览器、访问页面、检查 DOM、执行 Tab 导航与快捷键触发检查。

## 已检查页面

Playwright 浏览器验证覆盖：

- `/`
- `/play`
- `/play` 桌面视口：`1280x900`
- `/play` 移动端视口：`390x844`

验证内容：

- 页面可见文本中没有作为入口呈现的任务栏、游戏指南、灵感手记、仓库、成就、武器入口。
- DOM 中没有包含目标入口语义的可交互 `button`、`a`、`menuitem`、`tab`、`[tabindex]`、`data-testid`、`aria-label`、`title`、`aria-controls` 元素。
- 连续 Tab 导航不会聚焦到目标入口。
- 移动端视口下没有底部栏、dock、折叠菜单中的目标入口。
- `Control+K` 与 `?` 不会打开包含目标入口的 command palette、快捷键提示或 tooltip。

## 已检查旧路由

以下旧路由均通过浏览器逐个访问，结果均重定向到 `/play`，没有打开旧功能 UI：

- `/guide`
- `/help`
- `/tutorial`
- `/notes`
- `/journal`
- `/inspiration`
- `/inventory`
- `/warehouse`
- `/storage`
- `/achievements`
- `/weapons`
- `/armory`
- `/equipment`
- `/taskbar`
- `/toolbar`
- `/dock`

检查点：

- 旧路由不能打开完整指南、手记、仓库、成就、武器或任务栏 UI。
- 重定向后的页面仍通过同一套 DOM 与可聚焦元素检查。

## 叙事触发验证

项目没有公开的玩家可见调试 UI 用于直接触发这些能力；为避免新增替代菜单或调试入口，本阶段通过现有非 UI 测试直接调用叙事触发适配层与底层 store/service 能力。

命令：

```bash
pnpm exec tsx --test src/features/play/narrativeFeatureTriggers.test.ts src/store/useGameStore.phase4Commit.test.ts src/lib/playRealtime/weaponAdjudication.test.ts src/lib/playRealtime/equipmentExecution.test.ts src/lib/ui/prunedUiRoutes.test.ts src/components/UnifiedMenuModal.test.ts
```

结果：

```text
29 tests, 29 pass
```

覆盖能力：

- 游戏指南：叙事触发可以读取指南提示，指南内容仍保留。
- 灵感手记：叙事触发可以写入、更新、回顾线索/手记内容。
- 仓库/库存：叙事触发可以添加、检查、消耗物品。
- 成就：事件仍可解锁并写入成就状态。
- 武器：叙事/战斗事件仍可获得、装备、使用武器，武器属性仍参与战斗判定。
- 任务栏曾承载动作：必要动作通过叙事触发或主流程 store action 保留。

## 浏览器测试命令与结果

新增专项浏览器验证：

```bash
pnpm exec playwright test e2e/ui-pruning-browser-verification.spec.ts
```

结果：

```text
2 passed
```

合并现有相关浏览器验证：

```bash
pnpm exec playwright test e2e/play.spec.ts e2e/weapon-ui.spec.ts e2e/ui-pruning-browser-verification.spec.ts
```

结果：

```text
13 passed
```

覆盖项包括：

- 主游戏页不暴露任务栏入口。
- 主游戏页不暴露游戏指南、灵感手记、仓库、成就、武器入口。
- 设置中心只保留允许的可见 tab。
- 旧 guide/journal/warehouse/inventory/achievement/weapon/taskbar/navigation 路由不打开独立 UI。
- Tab 导航不会聚焦目标入口。
- 桌面与移动端浏览器视口均通过专项 DOM 检查。

## 发现的残留入口

未发现残留的用户主动 UI 入口。

允许存在的残留文本位置：

- 底层逻辑、store、service、schema、测试、数据、剧情内容、指南正文、手记正文、成就定义、武器定义、物品描述、审计文档。

不允许的位置已通过浏览器验证排查：

- 可见按钮、链接、菜单项、tab、快捷键提示、tooltip、旧路由页面、移动端 dock、可聚焦交互元素。

## 环境噪声与限制

- `@browser-use` in-app browser 运行时因本机 `D:\node\node.exe` 版本 `v22.17.1` 低于插件要求 `>= v22.22.0`，本次未能直接使用该插件打开浏览器。
- 已使用项目现有 Playwright Chromium 完成实际浏览器验证，不是只做静态 grep 或单元测试。
- 本地未运行 PostgreSQL 时，开发服务器日志出现 `connect ECONNREFUSED 127.0.0.1:5432`，属于当前环境的非致命数据库连接噪声；浏览器验证用例均通过。
- Next.js 输出 middleware 文件约定弃用警告，未影响本次验证结果。

## 结论

截至本次验证，任务栏、游戏指南、灵感手记、仓库、成就、武器不再通过用户主动 UI 入口暴露；旧路由不会打开旧 UI；桌面与移动端视口下没有可点击、可导航、可键盘聚焦或屏幕阅读器语义入口。底层功能内容、状态与业务动作仍通过叙事触发适配层和既有 store/service 测试得到验证。
