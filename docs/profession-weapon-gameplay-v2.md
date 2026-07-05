# 武器 / 职业系统 Stage-4 重构（2026-07-05）

> 授权范围：用户明确要求"以产品经理视角，对武器和职业系统进行全面升级优化，解决前后端冲突，允许一切改动和重构"。本次改动在此授权下进行，未额外扩大到 `/create` 角色创建流程与武器背包 UI 的整体复活（见「未采纳项」）。

## 1. 问题现状

重构前，武器与职业系统存在三类前后端脱节：

1. **战力计算对职业/武器几乎无感知**。`playerCombatScore.ts` 的隐藏战斗分完全不读职业（`profession`）、不读武器 tier/effectSource，也不读武器 `counterTags` 是否命中对方弱点——职业认证和武器成长在数值上不产生任何后果。
2. **武器结构化状态被绕过**。`weaponAdjudication.ts` 只用正则解析 `playerContext` 文本，`counterThreatIds` 永远按武器 id 回查一张只有 4 件武器的旧表；玩家"道具武器化"生成的新武器 id 不在表里，克制关系静默清零。`equipmentExecution.ts` 的 `equipTimeCostTurns` 是纯展示字段，`consumes_time` 永远硬编码 `true`。
3. **职业侧 UI 断头 + 排序 bug**。职业主动技能（如巡迹客/齐日角等的主动效果）只有 store 层 action（`activateProfessionActive`），没有任何入口触发；认证候选展示函数按 `PROFESSION_IDS` 固定顺序取前两个，与玩家实际投入（试炼进度/证据数）无关；认证触发分支里还有一条指向不存在的"设置→职业"面板的死路径。

## 2. 方案总览

### 2.1 战力系统接入职业与武器（`src/lib/combat/*`）

- `playerCombatScore.ts` 新增：
  - `WEAPON_TIER_SCORE`（C/B/A/S 对应 0/0.6/1.2/2）与 `effectSource` 存在时的固定加成，让武器强化在战斗分上有真实回报。
  - `weaponCounterMatchBonus`：武器 `counterTags` 命中对手 `vulnerableToTags` 时 +1.6，对应"用对武器"的验收诉求。
  - `PROFESSION_KIND_AFFINITY` + `PROFESSION_STYLE_TAG` + `professionCombatContribution`：职业按认证状态（+0.5）、冲突类型亲和（+1.0）、职业主动是否激活（+1.2）三段式加分；`derivePlayerStyleTags` 让 `styleTags` 真正反映职业与武器模组，而非硬编码 `close_quarters`。
- `npcCombatStyles.ts`：为全部 6 个"主要 NPC"风格 + 3 个通用模板补齐 `vulnerableToTags`，作为武器克制表的数据源。
- `combatAdjudication.ts` / `combatPromptBlock.ts`：新增 `PlayerCombatActorArgs`/`NpcCombatActorArgs` 显式类型，把 `profession`、`professionActiveEngaged`、`kind`、`opponentVulnerableTags`（从对手 `styleKey` 反查风格表得到）真正传导进 `computePlayerCombatScore`，两处战力入口（战斗裁定与 prompt 展示）保持口径一致。
- `useGameStore.ts` 的 `getPromptContext()` 补上 `promptProfession` / `promptProfessionActiveEngaged` 派生并传入 `buildCombatPromptBlockV1`。

### 2.2 武器结构化状态优先，装备耗时真实化（`src/lib/playRealtime/*`, `route.ts`）

- `weaponAdjudication.ts` 新增 `resolveEquippedWeaponSnapshot`：优先读 `clientState.equippedWeapon` 自带字段（含其自身的 `counterThreatIds`），旧的"从 4 件武器表回查"降级为 `clientState` 缺失时的兜底路径。`route.ts` 在 `phaseApplyStructuralGuards` 里把 `clientState` 一并传入，武器化生成的自定义武器不再被静默清零克制关系。
- `equipmentExecution.ts` 新增 `turnCostOf(weapon)`，真正读取 `equipTimeCostTurns`（未显式设置按 1 处理）；只有显式标注 `0`（"速拔武器"）的换装才会跳过回合消耗，其余行为不变。

### 2.3 职业可见性按真实投入排序（`src/lib/profession/professionVisibilityPolicy.ts`）

新增 `proximityScore`（行为证据 ×2、属性达标 +1、被认证人观察到 +2、试炼已发放 +3、试炼已接受 +2），`computeProfessionVisibility` 改为按分数降序取前 2，而不是永远按注册表固定顺序（守灯人/巡迹客优先）截断——溯源师等"后排职业"只要玩家真投入更多，就能优先展示。

### 2.4 职业主动技能可操作、认证触发不再死路径（`src/app/play/page.tsx` 等）

- 新增 `onUseProfessionActive()` + `professionActiveCdLeft`，复用 `onUseTalent` 的守卫结构（阅读锁定/审阅态/冷却/请求进行中/终局态/访客对话耗尽全部检查），调用既有 store action `activateProfessionActive()`。
- `MobileActionDock` 新增 `ProfessionActiveButton`（复用 `EchoTalentButton` 视觉模式，`hue-rotate` 区分主题色，不新增图标资源），只在玩家已认证职业时渲染——不引入 `e2e/weapon-ui.spec.ts` 禁止的任何 data-testid 或文案。
- 认证触发分支：`certifierNpcIds` 现在从 `PROFESSION_REGISTRY` 动态推导（不再硬编码 `"N-010"`），去掉了指向不存在设置面板的死分支和已废弃的 `getClientProfessionChoiceInterruptV1Enabled` 灰度开关，统一走"插入职业选择选项"的路径。

### 2.5 Feature Flag 默认开启（`src/lib/rollout/*`）

隐藏战斗系统此前处于灰度关闭状态（`enableHiddenCombatV1` 等 5 个开关默认 `false`），但其代码路径已完整、有测试覆盖，且是本次职业/武器数值联动的载体——继续默认关闭会让上述所有改动在生产环境不生效。已将服务端 `versecraftRolloutFlags.ts` 与客户端镜像 `versecraftClientRollout.ts` 中的 5 个战斗相关开关默认值从 `false` 翻转为 `true`。**这是本次改动里唯一改变现有生产行为默认值的部分，见下方风险说明。**

## 3. 改动文件清单

| 文件 | 改动性质 |
|---|---|
| `src/lib/combat/playerCombatScore.ts` | 战力公式扩展（职业+武器 tier/effectSource/克制） |
| `src/lib/combat/npcCombatStyles.ts` | 补 `vulnerableToTags` 字段 |
| `src/lib/combat/combatAdjudication.ts` | 新增显式类型，传导职业/克制标签 |
| `src/lib/combat/combatPromptBlock.ts` | 传导职业/克制标签到 prompt 展示 |
| `src/store/useGameStore.ts` | `getPromptContext()` 派生职业上下文 |
| `src/lib/playRealtime/weaponAdjudication.ts` | 结构化 `clientState` 优先于正则解析 |
| `src/app/api/chat/route.ts` | 传入 `clientState` 给武器裁定 |
| `src/lib/playRealtime/equipmentExecution.ts` | `equipTimeCostTurns` 真正生效 |
| `src/lib/profession/professionVisibilityPolicy.ts` | 按投入度排序而非固定顺序 |
| `src/app/play/page.tsx` | 认证触发修复、职业主动入口、CD 计算 |
| `src/features/play/mobileReading/types.ts` | `MobileActionDock` 新增职业主动相关 props |
| `src/features/play/mobileReading/components/MobileActionDock.tsx` | 挂载 `ProfessionActiveButton` |
| `src/features/play/mobileReading/components/ProfessionActiveButton.tsx` | 新文件，职业主动按钮 |
| `src/lib/rollout/versecraftRolloutFlags.ts` | 战斗系列开关默认值 `false`→`true` |
| `src/lib/rollout/versecraftClientRollout.ts` | 同上（客户端镜像），删除废弃开关函数 |

测试新增/扩展：`playerCombatScore.test.ts`（+6）、`combatAdjudication.test.ts`（+2）、`npcCombatStyles.test.ts`（+1）、`weaponAdjudication.test.ts`（+1）、`equipmentExecution.test.ts`（+1）、`professionVisibilityPolicy.test.ts`（新文件，3 例）。

## 4. 验证情况

- ✅ `pnpm exec tsc --noEmit`：完整跑通（约 3 秒，退出码 1，225 行输出）。逐条比对确认：所有改动文件（含 `route.ts`/`page.tsx`/`useGameStore.ts` 这三个大文件里我实际改过的区域）**零新增类型错误**；225 行全部来自与本次改动无关的既有背景问题（XHR 传输分支的 `string|null` 赋值、`userAgentData`、`queueAdmissionArgs` 等），与仓库现状（`next.config.ts` 的 `ignoreBuildErrors: true` + 既有历史欠账）一致。
- ✅ `npx eslint .`（限定本次改动的 20 个文件）：0 error，9 个既有 warning（`page.tsx` 的 5 个 `react-hooks/exhaustive-deps`、`useGameStore.ts` 的 4 个 `no-unused-vars`），均为已存在于改动行之外的历史警告，非本次引入。
- ⚠️ 未运行：`pnpm test:unit` / `tsx --test`。当前沙箱挂载的 `node_modules` 是为 macOS 构建的（`@esbuild/darwin-arm64`），沙箱本身是 Linux，导致任何触发 esbuild 原生二进制的命令（含 `tsx`）失败——用一个完全未改动的既有测试文件（`chatPurpose.test.ts`）做了基线测试，同样失败，确认这是沙箱环境问题而非本次改动引入。**未自行安装 `@esbuild/linux-arm64` 等包补救**，因为这会实际修改用户 Desktop 上持久化的 `node_modules`，超出未经明确要求授权的范围（对应 CLAUDE.md「不安装新依赖」的边界）。建议用户在自己的开发机（非本沙箱）上跑一次 `pnpm test:unit` 确认新增的 13 个测试用例全部通过。
- ⚠️ 未运行：`pnpm test:e2e:contract` / `pnpm benchmark:chat:mock` 等需要真实开发服务器的验证，同样受限于沙箱网络/esbuild 限制，建议用户本地跑一次，尤其是 `e2e/weapon-ui.spec.ts`（本次新增的 `ProfessionActiveButton` 理论上不违反其断言，但没有实测浏览器 DOM 确认）。
- ⚠️ 未运行：`pnpm eval:chat-quality:mock` / `pnpm eval:narrative-safety:mock`。战斗 prompt block 的文案未改，只是新增了两个已有字段的数值输入，但涉及 AI 感知的改动按 CLAUDE.md 建议应至少跑一次 eval 兜底。

## 5. 风险与后续

### 5.1 需要用户明确关注的风险

- **战斗系统 5 个 flag 默认开启是本次唯一的"生产行为默认值变更"**。这套系统此前长期灰度关闭，虽然代码完整且有单测覆盖，但从未在真实模型输出下做过端到端游玩验证（沙箱无法起真实开发服务器 + 真实 AI 网关）。建议上线前至少人工玩几个回合确认战斗提示文案质量，而不是直接依赖本报告的静态验证。
- 如果想更保守，可以先只保留本次的数值/职业接入代码改动，把 5 个 flag 改回按环境变量灰度控制（而不是硬编码默认 true），用小流量验证后再全量打开——这是一行改动即可回滚的点，我在此保留了原始的"改默认值"实现，如需要我可以随时切换为"保持默认关闭 + 显式在 `.env` 打开"的更保守版本。

### 5.2 本次明确未采纳/未涉及的范围（连带说明原因）

- **未复活 `src/components/WeaponSlotPanel.tsx`**：这是一个功能完整但零引用的孤儿组件。`e2e/weapon-ui.spec.ts` 明确断言"不应存在武器栏/装备等 UI 入口"（按名称、`data-testid`、指定文案三种方式断言），说明这是此前有意识裁剪掉的 UI 面，不是遗漏。本次新增的 `ProfessionActiveButton` 经过对照该测试文件逐条核对，未触碰任何一条断言。是否要正式启用武器背包 UI 是一个更大的产品决策（等于重新引入一整套面板级交互），建议单独立项讨论，不在本次"数值/职业主动"范围内擅自决定。
- **未改动 `/create` 角色创建流程**：现有创建流程只有性别/姓名人设/五维属性点分配/回响天赋，刻意不放职业与武器选择。保留"身份靠游玩获得，而非开局选择"的现有设计取向，未做变更。
- **`isTierGte` 在 `weaponLifecycle.ts` 与 `weaponizationPreview.ts` 中重复实现**：发现但未合并，因为不在本次"前后端冲突"范围内，且改动会牵涉两个文件的既有调用方，风险收益比不划算，留作独立小任务。

### 5.3 已知与本次无关的仓库状态（透明披露）

`git status --porcelain` 显示当前工作树里存在约 20 个与本次任务无关的既有改动/新增/删除（集中在 `src/features/play/components/PlayNarrativeTaskBoard.tsx`、`PlayTaskPanel.tsx`（已删除）、`src/lib/tasks/*`、`src/lib/playRealtime/playerChatSystemPrompt.ts`、`runtimeContextPackets.ts` 等任务看板相关文件），推测是本次会话开始前就存在的另一项未提交工作。本次全程未touch这些文件，也未运行任何 `git add`/`stash`/`reset`/`commit`，保持原样交由用户自行处理。另：`.git/index.lock` 长期存在（0 字节），未做任何 git 写操作，建议用户确认是否有残留的 git 进程。

