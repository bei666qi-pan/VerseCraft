# Mobile Reading UI Browser Verification

本文用于后续阶段记录 `/play` 移动端阅读壳层的浏览器验证结果。结构改动后不要只看截图相似度，也要确认稳定选择器、交互和旧入口裁剪没有回归。

## 验证对象

- 页面：`/play`
- 主目录：`src/features/play/mobileReading/`
- 最小视口：
  - `390×844`
  - `393×852`
  - `430×932`

## 必查状态

默认阅读态：

- `mobile-reading-shell` 可见。
- `mobile-reading-header` 可见，并包含 `VerseCraft` 与 `第六章：雾港来信`。
- `mobile-story-viewport` 可见。
- `mobile-action-dock` 可见。
- `manual-action-input` 可见。
- `options-toggle-button` 可见。
- `send-action-button` 可见。
- `mobile-bottom-nav` 可见。
- `mobile-options-dropdown` 默认不可见。

选项展开态：

- 点击 `options-toggle-button` 后，`mobile-options-dropdown` 可见。
- `mobile-option-item` 数量为 4。
- 不产生横向滚动。

底部导航：

- `bottom-nav-character` 可见，点击后打开移动阅读壳层内的角色页，不跳转、不打开旧任务 / 指南 / 手记 / 仓库 / 成就 / 武器面板。
- `bottom-nav-story` 只回到剧情阅读态。
- `bottom-nav-codex` 打开移动阅读壳层内的 `MobileCodexPanel`，不打开旧侧栏 / modal 图鉴。
- `bottom-nav-settings` 打开现有 `UnifiedMenuModal` 的设置；`UnifiedMenuModal` 当前只保留设置可见入口。

## 禁止回归

页面上不得重新出现这些主动 UI 入口：

- 任务栏
- 游戏指南
- 灵感手记
- 仓库
- 成就
- 武器

## 记录模板

后续补验证结果时按此格式追加：

```text
日期：
提交：
环境：
验证方式：Browser Use / Playwright
视口：
结果：
截图路径：
异常 / 噪声：
```

## 当前状态

本文件先建立验证口径；后续视觉或交互阶段在完成浏览器验证后继续追加具体结果。

```text
日期：2026-04-25
提交：本地结构重排阶段，提交号待定
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright
视口：390×844、393×852、430×932
结果：e2e/play-mobile-reading-ui.spec.ts 3 passed；e2e/play.spec.ts + e2e/ui-pruning-browser-verification.spec.ts + e2e/play-mobile-reading-ui.spec.ts 14 passed
截图路径：本阶段未保存正式截图
异常 / 噪声：本地 PostgreSQL 未启动导致 presence / analytics ECONNREFUSED 日志；不影响该 E2E 断言。Browser Use 已按插件流程尝试，但 node_repl 指向 D:\node\node.exe v22.17.1，低于插件要求的 >=22.22.0，因此本阶段用 Playwright 浏览器验证兜底。
```

```text
日期：2026-04-25
提交：阶段 2 本地视觉系统改造，提交号待定
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright；Browser Use 已尝试但 runtime 不满足版本要求
视口：390×844、393×852、430×932
结果：e2e/play-mobile-reading-ui.spec.ts 3 passed；折叠态隐藏选项，展开态显示 4 个选项且无横向滚动。
截图路径：本阶段未保存正式截图
异常 / 噪声：Browser Use 初始化失败，原因是 node_repl 解析到 D:\node\node.exe v22.17.1，插件要求 >=22.22.0；Playwright webServer 期间仍有本地 PostgreSQL 未启动导致的 presence / analytics ECONNREFUSED 日志，不影响断言通过。
```

```text
日期：2026-04-25
提交：手机端主壳层贴底布局阶段，提交号待定
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright；Browser Use 已尝试但 runtime 不满足版本要求
视口：390×844、393×852、430×932、1200×900、844×390
结果：e2e/play-mobile-reading-ui.spec.ts 5 passed；移动端折叠态隐藏选项，展开态显示 4 个选项且无横向滚动；桌面端手机宽度壳层居中；横屏核心控件仍可见。
截图路径：本阶段未保存正式截图
异常 / 噪声：Browser Use 初始化失败，原因是 node_repl 解析到 D:\node\node.exe v22.17.1，插件要求 >=22.22.0；Playwright webServer 期间仍有本地 PostgreSQL 未启动导致的 presence / analytics ECONNREFUSED 日志，不影响断言通过。
```

```text
日期：2026-04-25
提交：阶段 4 业务链路接入验证记录
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright；Browser Use 已尝试但 runtime 不满足版本要求
视口：390×844、393×852、430×932、1200×900、844×390
结果：e2e/play-mobile-reading-ui.spec.ts 8 passed；追加 e2e/play.spec.ts + e2e/ui-pruning-browser-verification.spec.ts 后合计 19 passed；音量按钮 aria 状态随现有 mute 状态切换；生命汇源天赋走 useTalent 后进入冷却；手动输入和选项点击均触发 /api/chat；图鉴 / 设置走 UnifiedMenuModal 并高亮底栏；当时角色入口仅作为占位验证，后续已由移动角色页替代。
截图路径：本阶段未保存正式截图
异常 / 噪声：Browser Use 初始化失败，原因是 node_repl 解析到 D:\node\node.exe v22.17.1，插件要求 >=22.22.0；Playwright webServer 期间仍有本地 PostgreSQL 未启动导致的 presence / analytics ECONNREFUSED 日志，以及 Next.js middleware 弃用提示，不影响断言通过。
```

```text
日期：2026-04-25
提交：阶段 5 移动端浏览器 E2E 回归测试补充
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright；Browser Use 已按插件流程尝试但 runtime 不满足版本要求
视口：390×844、393×852、430×932、1280×900
结果：e2e/mobile-reading-ui.spec.ts 10 passed；e2e/play.spec.ts + e2e/mobile-reading-ui.spec.ts 19 passed；覆盖基础渲染、手动输入 SSE mock、选项直发、底栏图鉴 / 设置 UnifiedMenuModal、角色占位态、音量、天赋、UI 裁剪和 Tab 焦点路径。
截图路径：Playwright test output 中由 test.info().outputPath 生成 mobile-reading-collapsed-390.png 与 mobile-reading-expanded-390.png；本地一次运行的产物为 test-results/mobile-reading-ui-mobile-r-5bca8-ed-and-expanded-screenshots-chromium/mobile-reading-collapsed-390.png 和 test-results/mobile-reading-ui-mobile-r-5bca8-ed-and-expanded-screenshots-chromium/mobile-reading-expanded-390.png。
异常 / 噪声：Browser Use 初始化失败，原因是 node_repl 解析到 D:\node\node.exe v22.17.1，插件要求 >=22.22.0；Playwright webServer 期间若本地 PostgreSQL 未启动，presence / analytics ECONNREFUSED 日志属于已知噪声，不影响断言。
```

```text
日期：2026-04-25
提交：阶段 6 真实浏览器手动核对记录，提交号见本次文档提交
启动命令：pnpm dev
访问地址：http://127.0.0.1:666
环境：Windows / Next dev server on port 666
验证方式：Browser Use 已按插件流程尝试，但 node_repl 解析到 D:\node\node.exe v22.17.1，低于插件要求的 >=22.22.0；因此使用 Playwright Chromium headless real browser 连接真实 pnpm dev 服务完成验证。
视口：390×844、393×852、430×932
页面：/play；旧路由 /guide、/help、/tutorial、/notes、/journal、/inspiration、/inventory、/warehouse、/storage、/achievements、/weapons、/armory、/equipment、/taskbar、/toolbar、/dock
默认阅读态结果：通过。截图人工核对了深蓝黑背景、顶部 VerseCraft / 羽毛意象 / 竖线 / 第六章标题 / 音量圆形按钮、正文暖金色衬线叙事排版、底部胶囊输入条、回响天赋按钮、placeholder `输入下一步行动或对白…`、选项展开按钮、纸飞机发送按钮，以及角色 / 剧情 / 图鉴 / 设置四项底栏；剧情默认高亮；三个移动视口均无横向滚动。
选项展开态结果：通过。点击纸飞机左侧 `options-toggle-button` 后，`mobile-options-dropdown` 出现在输入条下方和底栏上方；390×844 实测 layout 为 dockBottom=468、dropdownTop=468、dropdownBottom=734、navTop=746；4 个 `mobile-option-item` 均为可点击按钮样式，右箭头和边框可见；点击 `检查学生电子表` 直接触发 /api/chat SSE mock，发送后下拉收起，提交次数为 1。
手动输入结果：通过。点击 `manual-action-input` 可聚焦；输入 `靠近铁牌查看痕迹` 后纸飞机按钮可用；点击发送走 /api/chat SSE mock，mock final narrative `雾声压低，你的行动被世界接住。` 落到正文，输入框清空；请求 pending 时发送按钮禁用，强制二次点击未产生重复提交。
底栏结果：通过。点击角色不跳转、不打开 modal、不新增角色界面；点击剧情保持 / 返回阅读态；点击图鉴打开现有 UnifiedMenuModal 图鉴视图；关闭后点击设置打开现有 UnifiedMenuModal 设置视图；关闭后恢复剧情高亮，底栏仍可见且图标不变形。
旧功能入口回归：通过。浏览器中扫描 button / link / tab / menuitem / aria-label / data-testid / data-onboarding，并走 48 次 Tab 焦点路径，均未发现任务栏、游戏指南、灵感手记、仓库、成就、武器等主动入口。
旧路由回归：通过。/guide、/help、/tutorial、/notes、/journal、/inspiration、/inventory、/warehouse、/storage、/achievements、/weapons、/armory、/equipment、/taskbar、/toolbar、/dock 均返回 200 并最终回到 /play，未打开旧功能 UI。
截图路径：D:\versecraft\.runtime-data\phase6\manual-collapsed-390x844.png；D:\versecraft\.runtime-data\phase6\manual-collapsed-393x852.png；D:\versecraft\.runtime-data\phase6\manual-collapsed-430x932.png；D:\versecraft\.runtime-data\phase6\manual-expanded-390x844.png
手动验证产物：D:\versecraft\.runtime-data\phase6\manual-browser-check-result.json
测试命令与结果：npx eslint . 通过，0 errors / 145 warnings，warnings 来自既有源码与未跟踪 .claude/worktrees；pnpm test:unit 通过，987 pass；pnpm exec playwright test e2e/play.spec.ts e2e/mobile-reading-ui.spec.ts 通过，19 passed；pnpm build 通过。
发现的问题和修复结果：未发现需要修改产品代码的问题。临时验证脚本本身做过两处稳定性修正：使用 @playwright/test 的 Chromium 入口，并将各验证段隔离到独立 browser context，随后重新执行通过。
无法验证项：无法使用 Browser Use 的 in-app browser，原因是本机 node_repl Node 版本不满足插件要求；已用 Playwright Chromium 真实浏览器兜底。控制台噪声包括临时播种页的 404、未启动本地 PostgreSQL 时的 presence / analytics 500，以及 Next.js middleware 弃用提示；pageerror 为 0，不影响本次断言。
```

```text
日期：2026-04-25
提交：Phase 7 最终代码审查、稳定性检查与测试全量回归，提交号见本次最终提交
启动命令：pnpm dev
访问地址：http://127.0.0.1:666
环境：Windows / Next dev server on port 666
浏览器 / Playwright 使用方式：Browser Use 已按插件流程尝试，但 node_repl 解析到 D:\node\node.exe v22.17.1，低于插件要求的 >=22.22.0；因此使用 Playwright Chromium headless real browser 连接真实 pnpm dev 服务完成最终浏览器复查。
检查视口：390×844、393×852、430×932；自动 E2E 另覆盖 1280×900。
检查页面：/play；旧路由 /guide、/help、/tutorial、/notes、/journal、/inspiration、/inventory、/warehouse、/storage、/achievements、/weapons、/armory、/equipment、/taskbar、/toolbar、/dock。
默认阅读态结果：通过。人工查看 D:\versecraft\.runtime-data\phase7\manual-collapsed-390x844.png、manual-collapsed-393x852.png、manual-collapsed-430x932.png，确认深蓝黑背景、VerseCraft 标识、竖线、章节标题、音量按钮、正文暖金色叙事排版、输入胶囊、回响天赋按钮、placeholder、选项按钮、纸飞机按钮、四项底栏和剧情默认高亮仍保持截图目标风格；三个移动视口无横向滚动。
选项下拉结果：通过。点击 options-toggle-button 后 mobile-options-dropdown 出现在输入条下方和底栏上方；390×844 实测 dockBottom=468、dropdownTop=468、dropdownBottom=734、navTop=746；4 个 mobile-option-item 均为可点击按钮样式，右箭头可见。点击“检查学生电子表”直接触发 /api/chat SSE mock，发送后下拉收起，提交次数为 1。
手动输入验证结果：通过。manual-action-input 可聚焦；输入“靠近铁牌查看痕迹”后 send-action-button 可点击；点击纸飞机走 /api/chat SSE mock，final narrative 落到页面，输入框清空；pending 期间发送按钮禁用，强制二次点击未产生重复提交。
底栏验证结果：通过。阶段 6 时角色入口仍为占位；本次角色页补全后以最新浏览器验证记录为准。剧情入口保持 / 返回阅读态；图鉴和设置分别打开现有 UnifiedMenuModal 的 codex / settings 视图；关闭 modal 后恢复剧情高亮，底栏仍可见且图标不变形。
旧功能入口回归结果：通过。浏览器检查 button / link / tab / menuitem / aria-label / data-testid / data-onboarding，并走 48 次 Tab 焦点路径，未发现任务栏、游戏指南、灵感手记、仓库、成就、武器等主动入口。旧路由均最终回到 /play，未打开旧功能 UI。
截图路径：D:\versecraft\.runtime-data\phase7\manual-collapsed-390x844.png；D:\versecraft\.runtime-data\phase7\manual-collapsed-393x852.png；D:\versecraft\.runtime-data\phase7\manual-collapsed-430x932.png；D:\versecraft\.runtime-data\phase7\manual-expanded-390x844.png。
手动验证产物：D:\versecraft\.runtime-data\phase7\manual-browser-check-result.json。
测试命令与结果：npx eslint . 通过，0 errors / 145 warnings；pnpm test:unit 通过，987 pass；pnpm exec playwright test e2e/play.spec.ts e2e/mobile-reading-ui.spec.ts 通过，19 passed；pnpm build 通过；pnpm test:ci 通过；pnpm exec playwright test e2e/mobile-reading-ui.spec.ts 最终复查通过，10 passed。
发现的问题和修复结果：最终单跑 mobile-reading-ui E2E 时发现截图用例偶发 mobile-option-item 为 0。原因是测试种子只写 root transient currentOptions，等待较久时可能被页面补选项流程清空；已修复为同时写入 saveSlots.main_slot.currentOptions，使测试夹具符合真实存档恢复路径，并已重新跑完整回归通过。
噪声 / 无法验证项：Browser Use in-app browser 因本机 Node 版本低于插件要求无法初始化；已用 Playwright Chromium 真实浏览器兜底。未启动本地 PostgreSQL 时，dev / Playwright 输出包含 analytics / presence ECONNREFUSED 127.0.0.1:5432，以及 Next.js middleware 弃用提示；这些未导致测试失败。
```

```text
日期：2026-04-25
提交：feat: complete mobile character tab，提交号见本次最终提交
启动命令：pnpm dev
访问地址：http://localhost:666/play
环境：Windows / Next dev server on port 666
浏览器 / Playwright 使用方式：优先尝试 Browser Use in-app browser，但 node_repl 解析到 D:\node\node.exe v22.17.1，低于插件要求的 >=22.22.0；因此使用 Playwright Chromium headless real browser 连接真实 pnpm dev 服务完成验证。
检查视口：390×844、393×852、430×932
检查页面：/play
角色页验证结果：通过。点击 bottom-nav-character 后 URL 不跳转，bottom-nav-character 获得 aria-current="page"，页面显示 mobile-character-panel、角色、身份信息、当前属性；默认职业显示“无”；seeded professionState.currentProfession="齐日角" 时显示“齐日角”；时间显示“第 0 日 · 00:00”；位置 B1_SafeZone 显示“B1 安全中枢”；精神显示“12 / 19”，敏捷等非精神属性显示“/ 50”；原石胶囊显示“原石 12”。
加点验证结果：通过。点击 character-upgrade-agility 调用现有 upgradeAttribute，敏捷从 17 / 50 变为 18 / 50，原石从 原石 12 变为 原石 9，符合总属性点 >=20 时成本 3 的既有规则。
剧情回退结果：通过。点击 bottom-nav-story 后回到阅读态，mobile-action-dock、manual-action-input、options-toggle-button、echo-talent-button 均恢复可见。
图鉴 / 设置结果：通过。bottom-nav-codex 打开现有 UnifiedMenuModal 的 codex 视图，关闭后 bottom-nav-settings 打开现有 UnifiedMenuModal 的 settings 视图；没有新增第二套图鉴或设置 UI。
旧功能入口回归结果：通过。浏览器检查 button / link / tab / menuitem / aria-label / data-testid / data-onboarding，并走 24 次 Tab 焦点路径，未发现任务栏、游戏指南、灵感手记、仓库、背包、库存、成就、武器、装备等主动入口。
视觉核对结果：通过并修复过一处问题。首次截图发现 390×844 下属性描述列过窄，文本近似竖排；已收窄固定列、缩小描述字号并重新验证。复查截图中角色页保持深蓝黑背景、暖金色标题与边框、原石胶囊、身份信息面板、当前属性面板、加点按钮和底栏角色 active 光效。
截图路径：D:\versecraft\.runtime-data\character-tab\character-390x844.png；D:\versecraft\.runtime-data\character-tab\character-393x852.png；D:\versecraft\.runtime-data\character-tab\character-430x932.png；D:\versecraft\.runtime-data\character-tab\character-profession-qirijiao-390x844.png
测试命令与结果：npx eslint . 通过（0 errors / 145 warnings，warnings 来自既有代码与未跟踪 .claude/worktrees）；pnpm test:unit 通过（991 pass）；pnpm exec playwright test e2e/mobile-reading-ui.spec.ts e2e/play.spec.ts 通过（20 passed）；pnpm build 通过；pnpm test:ci 通过；最终复跑 pnpm exec playwright test e2e/mobile-reading-ui.spec.ts 通过（11 passed）。
发现的问题和修复结果：真实截图复核发现 390×844 下属性描述列过窄，文本接近竖排，已修复为更窄固定列和更小描述字号后重验通过。完整 Playwright 首轮还暴露过一次 430×932 smoke 在本地 dev/DB 噪声下短暂停留“读取世界线中...”，已把 e2e openSeededPlay helper 改为等待 mobile-reading-shell 完成 hydration，再重跑 20 项和 11 项均通过。
异常 / 噪声：本地 PostgreSQL 未启动时，dev server 输出 presence / analytics ECONNREFUSED 127.0.0.1:5432；Next.js 输出 middleware 弃用提示。这些噪声未导致本次断言失败。Browser Use in-app browser 无法初始化的原因如上，已用 Playwright Chromium 兜底。
```

```text
日期：2026-04-25
提交：feat: redesign mobile codex tab，提交号见本次最终提交
启动命令：pnpm dev
访问地址：http://localhost:666/play
环境：Windows / Next dev server on port 666
浏览器 / Playwright 使用方式：优先尝试 Browser Use in-app browser，但 node_repl 解析到 D:\node\node.exe v22.17.1，低于插件要求的 >=22.22.0；本仓库没有需要同步修改的 Node engines 声明，因此未改 package.json / 文档技术栈声明，改用 Playwright Chromium headless real browser 连接真实 pnpm dev 服务完成验证。
检查视口：390×844、393×852、430×932
检查页面：/play
图鉴页验证结果：通过。点击 bottom-nav-codex 后未打开 #unified-menu-content，未出现旧侧栏、旧“图鉴 · 目录”或关闭按钮；bottom-nav-codex 获得 aria-current="page"；Header 显示 VerseCraft | 图鉴；页面显示 mobile-codex-panel 和 “B1层已识别人物：4 / 4”。
横向卡片验证结果：通过。B1 四个 NPC 槽位均按 codex[id] 识别；4 / 4 时追加 disabled “—— / 暂无更多”卡；横向 card strip 在三个视口均可滚动；选中卡有橙金边框和光效；当前 CODEX_PORTRAITS 为空，卡片区 img 数量为 0，全部使用 CSS 剪影占位且无 broken image。
详情面板验证结果：通过。面板显示人物名、位置、人物简介、我所见、关系印象；点击 N-015 后位置显示 “B1 安全中枢”；mobile-codex-panel 文本不泄漏 B1_SafeZone 或 B1_Storage 等 raw id。
底栏切换结果：通过。点击 bottom-nav-story 后回到剧情阅读态，mobile-action-dock、manual-action-input、options-toggle-button、echo-talent-button 恢复可见；点击 bottom-nav-character 后 mobile-character-panel 仍正常；点击 bottom-nav-settings 后只打开 settings modal，data-onboarding="settings-tab" 为 1，data-onboarding="codex-tab" 为 0。
旧功能入口回归结果：通过。浏览器检查 button / link / tab / menuitem / aria-label / data-testid / data-onboarding，未发现 taskbar、guide、journal、warehouse、backpack、inventory、achievements、weapon、equipment 等主动入口。
横向滚动结果：通过。390×844、393×852、430×932 下 documentElement / body scrollWidth 均未超过 viewport 宽度；卡片区内部横向滚动不撑破页面。
截图路径：D:\versecraft\.runtime-data\codex-tab\mobile-codex-390x844.png；D:\versecraft\.runtime-data\codex-tab\mobile-codex-393x852.png；D:\versecraft\.runtime-data\codex-tab\mobile-codex-430x932.png。
浏览器验证产物：D:\versecraft\.runtime-data\codex-tab\mobile-codex-verification.json。
测试命令与结果：npx eslint . 通过（0 errors / 145 warnings，warnings 来自既有源码与未跟踪 .claude/worktrees）；pnpm test:unit 通过（996 pass）；pnpm exec playwright test e2e/mobile-reading-ui.spec.ts e2e/play.spec.ts 通过（20 passed）；pnpm build 通过。
发现的问题和修复结果：首次临时 Playwright 验证脚本因一次瞬时 pageerror “Invalid or unexpected token”中止，但同一脚本重新执行后三个视口均通过，页面断言和正式 E2E 未复现该问题。未发现需要继续修改产品代码的视觉或交互阻塞项。
异常 / 噪声：本地 PostgreSQL 未启动时，dev server 输出 presence / analytics ECONNREFUSED 127.0.0.1:5432；Next.js 输出 middleware 弃用提示。这些噪声未导致本次断言失败。Browser Use in-app browser 无法初始化的原因如上，已用 Playwright Chromium 兜底。
```
