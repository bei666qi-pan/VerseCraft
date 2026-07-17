# 低成本真实链路稳定性测试

## 分层策略

1. 每次改动运行 `pnpm test:stability:cheap`。该层不调用模型、不依赖数据库，覆盖 SSE 任意分片、CRLF 代理、截断/损坏/重复终帧、未知控制帧、状态数值边界、集合幂等和结局提交。
2. 涉及 harness、状态 delta 或评分规则时运行 `pnpm test:evals` 与 `pnpm test:judge`。
3. 涉及 `/api/chat`、prompt、模型路由或服务端 guard 时，再运行 mock E2E 与 benchmark。
4. 只有上述门禁全部通过后，才抽样运行真实网关 smoke；相同输入优先命中 live result cache。真实长程活动只用于发现模型行为漂移，不承担基础传输与状态边界验证。

## 故障模型

- TCP/代理在任意字节边界拆分 UTF-8 SSE 数据。
- `LF` 被代理转换为 `CRLF`。
- 流在终帧中途断开。
- final JSON 损坏。
- 服务端发送未来版本未知控制帧。
- 同一流出现多个合法 final，以最后一个完整合法终帧为权威结果。
- 单个 SSE event 包含多行 `data:`。
- 同回合同时消耗和获得物品。
- 重复任务、图鉴 delta 重放。
- `NaN`、`Infinity` 和超大负数进入资源字段。

## 成本控制原则

- 传输故障、幂等、边界数值和状态机问题必须由纯函数确定性测试发现，不消耗 token。
- mock 用来验证完整 HTTP/SSE 工作流；真实模型仅验证语言行为与供应商差异。
- 真实测试失败后先把匿名化失败样本固化为离线 fixture，再修复和回归，避免反复付费复现同一问题。

## 产品质量证据口径

`scripts/report-product-quality.ts` 同时读取旧版 harness 指标和真实 SSE 终帧中的 `_eval_metrics`，避免因 artifact 版本不同漏算 token 或延迟。

- `agencyResponseRate`：玩家行动是否得到足够长度、带明确合法性/时间裁决的响应。
- `structuredConsequenceRate`：仅在玩家明确要求改变状态的回合中，统计结构化 delta、明确拒绝或明确幂等确认；自动图鉴写回不算核心玩法后果。
- `deadTurnRate`：明确要求改变状态，却既无 delta、无拒绝、也无“已经/无法/未满足”等幂等解释的比例。
- `progressionTurnRate`：快照中任务、资源、位置、职业、武器等长期状态发生变化的比例。
- validator 的 shadow/待复核 telemetry 进入 bug ledger，但不自动当成玩家可见缺陷扣分；只有确认泄露、关系越权或硬阻断证据才计入世界一致性缺陷率。
- 功能触达与功能贡献分开统计。玩家尝试某功能即算触达；只有该功能自己的结构化字段发生变化才算贡献，不能用同回合的其他状态变化冒充贡献。

功能删除不能由单批 trace 自动决定。至少需要 20 次有效触达、Wilson 置信区间、玩家满意度证据，以及简化/移除 A/B 没有伤害留存、推进和叙事质量的结果。

## 主观可玩性：代理筛选 + 真人确认

`subjective-playability-proxy-v1` 免费计算行动回报、张力、新鲜度、选择意义、清晰度和继续游玩意愿代理分。它的来源固定标记为 `heuristic_proxy`，置信度固定低于 0.5，只用于把最值得人工看的回合排到前面，不能冒充玩家意见。

将真实 trace 导出为六维真人量表：

```bash
pnpm exec tsx benchmarks/human-eval/exporter.ts \
  --mode=likert \
  --rubric=playability \
  --input=.runtime-data/eval/<run>/traces/<trace>.json \
  --output=.runtime-data/eval/human-playability
```

用于功能去留的真人证据应优先使用盲化 A/B，而不是单版本打分。至少报告样本数、评估人数、维度均值、偏好率和置信区间；没有真人证据时，产品报告必须保留 `human_playability_evidence_missing` 门禁。

## Prompt 成本实验

真实终帧 `_eval_metrics.prompt_component_chars` 只记录组件长度，不记录 prompt、玩家输入或 narrative 原文。报告会按组件聚合，并按 stable prefix 长度自动区分 `full_stable` / `compact_stable` 变体。

2026-07-13 的同场景小样本结果：full stable 为 2/2 可见 final、平均 11,470 input tokens；compact stable 为 0/2、平均 6,264 input tokens，两次均产生 `runtime:compact_prompt_empty_final`。因此 `AI_CHAT_STANDARD_COMPACT_STABLE_PROMPT` 默认关闭，只允许显式实验。不能为了 45% token 降幅接受不可游玩的空正文。

下一步成本优化应优先拆分动态段，而不是直接删除完整 stable 契约。当前最大动态组件依次是 runtime packets（4,000 chars）、NPC consistency（1,471）、narrative style（1,435）、reality constraint（1,400）。任何压缩都必须逐组件 A/B，并以可见 final、结构化状态正确率、世界一致性和真人可玩性为联合门禁。

Runtime packet 旧实现超预算时会对完整文本直接 `slice`，可能把 JSON 从中间截断。现改为按权威优先级逐个加入完整子包：放不下的可选子包整包跳过，任何预算下最后一行都必须可被 `JSON.parse`。full lane 默认预算从 4,000 降到 3,200 chars，并保留 `AI_CHAT_RUNTIME_PACKET_MAX_CHARS`（安全下限 2,400、上限 4,000）回滚开关。

同场景真实对照：4,000 预算 2/2 通过、首回合平均 11,469.5 input tokens；3,200 预算 2/2 通过、首回合平均 11,164.5，下降约 2.7%。3,200 预算的四回合战斗回归保持武器 72→68、污染 0→1、单次真实威胁压制结算，总输入由旧基线 47,360 降至 45,860（约 3.2%）。

### 动态治理包去重 V1

`VERSECRAFT_ENABLE_PROMPT_PACKET_DEDUP_V1` 默认开启，可独立回滚。开启后：

- narrative style bible 开启时不再重复注入 legacy style guide；
- reality packet 保留地点、时间、在场/死亡 NPC、职业、装备、线索、活跃威胁与摘要，只把 stable prompt 已有的通用规则折叠成三条短执行提示；
- post-generation validator、事实门闸、NPC consistency 和结构化提交链保持不变。

2026-07-13 同一真实场景单回合 A/B：输入 token 从 11,014 降至 10,386（-5.7%），动态段从 12,382 chars 降至 11,131（-10.1%），未缓存输入从 3,718 降至 3,090（-16.9%）；最终回合 3.4s，叙事、NPC 在场与图鉴提交正常。121-case mock quality gate 为 0.9917，`gatePass=true`。样本仍小，不能据此声称长程质量等价；下一步需在战斗、锻造、职业认证、跨层移动四类场景做配对回归。

该 A/B 同时发现实体匿名化滑窗会把“电梯口方向走过来”中的重叠窗口“向走”替换为“陌生人”。已将导航复合词加入停用/高置信排除，并固化真实句式回归；这说明成本实验必须同时审查玩家可见正文，不能只看 token 与 schema 成功率。

### 锻造服务真实闭环（2026-07-15）

新增 `forge-service-flow`：携带真实完整 client snapshot，覆盖世界内已有武器、在场服务 NPC、原石、行囊/仓库材料、报价、执行与执行后核对。真实活动先后发现并修复：

- 世界内已有但不在 legacy `WEAPONS` 固定表的武器被误判为“未装备”；
- 模型报价与确定性 guard 实际费用互相矛盾；
- `weapon_updates` 只更新顶层稳定/污染，未同步 harness 的 `weaponBag`；
- `consumed_items` 只减少数量，材料 ID 留在下一回合 snapshot，可被重复消费；
- 锻造预览把内部配方 ID 与标签直接泄漏到玩家正文。

修复后 4 回合真实活动通过：原石 6→5、稳定度 55→85、污染 8→0、仓库材料 `W-B101` 仅消费一次、武器袋保持一把且同步为 85/0。总计 43,811 input、1,001 output、29,696 cached input，说明业务闭环虽正确，但四个高度确定性的服务回合仍付出了约 44k 输入 token；下一阶段应把“状态核对/报价/执行”移到模型前 deterministic service fast lane。不要通过增加模型重试解决供应商 `stream_done_empty_exhausted`，应让该类动作不依赖主模型。

#### 确定性 fast lane 实测

`/api/chat` 已在输入安全、反作弊和风险分流之后、KG/lore/control preflight/主模型之前识别窄范围确定性动作：B1 锻造状态核对、报价、执行，以及格式明确的装备/卸装/换装指令。输出仍走标准 SSE `__VERSECRAFT_FINAL__`、`normalizePlayerDmJson` 与 `resolveDmTurn`，并通过响应头和 `_eval_metrics.model_calls=0` 留下审计证据。

- `.runtime-data/eval/live-forge-zero-token-final-20260715/live-playthrough-report.md`：4/4 回合、玩法门禁 5/5；input/output/cached token 全部为 0，总耗时 0.6 秒，单回合 12–505ms。
- 首次实测发现规范化会丢失服务回合的 `narrative_only`，可能诱发客户端补选项模型请求；修复后四回合均没有 `invalid_decision_options_waiting_regen`。
- 与改造前同活动 43,811 input + 1,001 output 相比，确定性部分实际归零，属于移除不必要模型调用，不是调低 token 数值。

职业×战斗活动首次在第 2 回合遇到上游空流，成本断路器立即停止余下调用。随后修正场景快照中“同一武器既已装备又在武器袋”的矛盾，并把明确装备指令纳入 fast lane。`.runtime-data/eval/live-profession-combat-rerun-20260715/live-playthrough-report.md` 复跑 6/6 通过；装备回合 0 token / 142ms，其余真实 DM 回合共 55,888 input、1,551 output，武器稳定 72→68、污染 0→1，试炼前置不足时未错误认证。

该复跑也留下下一项待修缺陷：接战回合正文提前写出“污染+5、稳定-3”但没有同步 delta；正式攻击回合才提交 72→68、0→1，而且 `conflict_outcome` 仍为空。后续需拆分“战术预测”和“正式结算”文案，并对明确攻击建立必有结构化 conflict outcome 的门禁后再真实复跑。

#### 职业×战斗闭环深挖（2026-07-15）

对 `profession-combat-synergy` 连续执行真实修复复跑，而不是以第一次绿色报告为终点。最终结构闭环已确认：装备 0 token、威胁侦察 0 token、明确攻击一次性提交 `weapon_updates`、`main_threat_updates` 与 `conflict_outcome`；稳定 72→68、污染 0→1，试炼前置不足时不认证。

成本对照：旧活动约 55,888 input / 1,551 output；把明确装备与只读威胁侦察移到确定性通道后，完整六回合稳定在约 43.5k–44.0k input，输入成本下降约 21%，同时规避两次真实官网空流导致的装备/侦察中断。主战斗叙事仍保留模型生成，没有用模板冒充主要叙事。

真实复跑进一步暴露并固化了以下检测与守卫：

- 侦察动作不得触发武器损耗；理智 delta 不能反推玩家使用了武器。
- 明确攻击必须返回结构化 `conflict_outcome`，纯理智损耗不得映射成身体擦伤。
- 新身体伤势没有 `injury_delta` 时从正文移除；启发式裁判新增 `physical_injury_without_state`。
- 武器袋有武器但未装备不再误报“凭空持有”；正文声称“没武器”但状态持有时自动校正。
- 注册 NPC 不等于当前在场 NPC；`presentNpcIds` 之外的直接出场、对白与图鉴写回在 final 边界移除，并进入 `offscreen_npc_presence` 评分。
- `{prof_trial_lampkeeper}` 一类内部 ID 映射为玩家文案，并由 `dm_only_leak` 门禁覆盖未知花括号 ID。
- 一个 major 问题不再因整数四舍五入显示成 5/5；现保留 4.5 等真实扣分。
- 中文姓名匿名化补充“然后向走廊”等导航句式，避免把方向介词改成“陌生人”。

证据报告：

- `.runtime-data/eval/live-profession-combat-final-attempt-20260715/`：结构通过，但新伤势检测复判为 4.5/5 fail，证明评分升级有效。
- `.runtime-data/eval/live-profession-combat-injury-guard-20260715/`：伤势修复生效，随后发现武器袋假阳性与“没武器”真矛盾。
- `.runtime-data/eval/live-profession-combat-npc-boundary-final-20260715/`：6/6、5/5、约 43.6k input；人工审计发现注册但不在场 NPC 被允许直接出场，随后补 final 守卫。
- `.runtime-data/eval/live-profession-combat-clean-final-20260715/`：新武器损伤检测成功拦住战后重复宣称损耗；据此修正为“历史已有稳定度下降可描述旧损伤，状态检查不得再次触发战术裁决”。

结论：绿色分数只作为候选证据，必须继续抽查正文；每次真实漏报都回流为纯函数 detector + final guard + fixture，之后同类问题不再重复付费发现。

### 职业试炼、位置与结局边界（2026-07-15）

职业试炼交付从“模型叙事 + 客户端推导”收敛为受控 delta：

- `profession_trial_result` 由服务端守卫产生，不接受候选模型字段。
- 守灯人试炼仅在 B1 签发地点、任务 active、且存在专属 `clue:trial:lampkeeper:verified_record` 时完成；普通无关线索不能冒充证据。
- `trial_completed` 不等于 `certified`；职业最终认证仍由完整 store 条件裁决。harness 已停止把试炼完成误写成已认证。
- 首次交付只完成一次；重复交付无任务、认证、奖励或货币变化。

真实证据：

- `.runtime-data/eval/live-profession-trial-zero-token-final-20260715/`：3 回合完成“核对→交付→重放”，仅首次交付产生 completed + trial result，职业仍为未认证；0 token，0.6s。
- `.runtime-data/eval/live-profession-trial-missing-evidence-retry-20260715/`：无专属证据时返回 `prerequisite_missing/verified_record_missing`，任务仍 active；0 token。
- 改造前同交付活动两次模型调用约 21.8k input，且正文与 completed 相互矛盾；改造后确定性交付与重放均为 0 token。

位置专项先发现严重假绿：模型可在 `is_action_legal=false` 时仍提交 B2 位置，并凭空生成值班大叔、保洁间窗户和制服捷径。修复后：

- 显式跳层、瞬移、无登记窗户捷径走 0-token 确定性拒绝。
- 模型候选 `player_location` 必须通过世界图相邻边与解锁条件；旧中文存档位置先归一为 canonical node 再校验。
- 正文声称连续穿过多个楼层却无位置 delta 时，final guard 改为原地拒绝；离线裁判同步增加跨楼层过程检测。
- `.runtime-data/eval/live-cross-floor-teleport-varied-final-20260715/`：4 种越界方式全部留在 `1F_Lobby`，无副作用，0 token，拒绝文案重复率 0%，5/5。

结局测试也完成口径纠偏：

- 旧 `happy-speedrun` 把不存在于当前世界图的“暗月大厅/传送阵/循环核心”当作速通路线。8 回合真实探针花费 40.1s、约 31.6k input，模型生造多个地点却无任何 ending delta。该伪正向场景已重构为“前置不足时不得伪速通”负向场景。
- live gate 现同时支持 `requiredFeatureOutcomes` 和 `forbiddenFeatureOutcomes`；叙事 5/5 但没有 `ending_finale` 不再能冒充通关。
- 显式承认前置不足却要求 `true_escape/结算` 的输入走 0-token 拒绝。`.runtime-data/eval/live-premature-ending-zero-token-final-20260715/` 4 回合无 ending、无位置/NPC/奖励副作用，1.3s，5/5。
- 真正正向结局证据必须来自客户端 `escapeMainline → ending eligibility → final choice → ending_finale → immutable settlement` 链路。当前 77 项相关确定性回归通过，覆盖真/假/代价逃离、窗口过期、B2 权限、终态不回滚、结算幂等和存档持久化。

产品去留结论（当前证据级别）：

- **保留并加强**：世界图移动、结构化任务/试炼/战斗 delta、结局状态机、生成后守卫；它们是防止 AI 把“讲得像”冒充“真做到”的核心。
- **简化**：状态查询、装备、侦察、锻造、任务交付、越界拒绝不应默认调模型；用短而有变化的确定性反馈，把 token 留给真正有叙事价值的战斗、对话和结局正文。
- **删除/停用**：不对应当前 authored world 的“伪速通”测试剧本；任何只依赖叙事分数、不要求结构结果的玩法通过标准。
- **暂不删功能**：没有达到 20 次有效触达和真人盲测前，不因为单批代理分数删除玩家功能；当前可以删的是无效测试与不必要模型调用，不是未经证伪的玩法。

### 任务奖励、经济与死亡链路（2026-07-15）

- 任务奖励的唯一生产执行器是 `useGameStore.ts` 内的 `applyTaskRewardConsequences` + `finalizeTaskMutation`。真实 store 回归确认 `b1_survival_rhythm` 完成后原石只增加 2、后继任务解锁、重复 `updateTaskStatus + updateTask` 不会二次发奖，存档会保留 `appliedRewardTaskIds`。
- `src/lib/tasks/rewardDelivery.ts` 零生产引用，且使用 `Date.now()` 创建另一套物品 ID，会制造第二真相源，已删除。任务、奖励、叙事物品写回相关 67 项测试通过。
- 泛化的“找 NPC 接任务 / 看商店 / 买恢复品”脚本不能作为经济通过证据：没有固定已注册商店和商品时，只会诱导模型发明交易。当前真实消费证据以 `forge-service-flow` 的 B1 已注册锻造服务为准。
- 死亡回合由 `applyStage2SettlementGuard` 冻结物品、货币、任务、威胁、武器与 NPC 位置变化，避免死时领奖、扣费或推进任务。
- 客户端死亡提交后进入不可重复创建的 `settlement_ready` 快照并清空普通选项；手输、选项和 `sendAction` 三处均阻断死后普通行动。浏览器回归 `e2e/ending-death.spec.ts` 通过（1/1，约 26 秒），覆盖死亡终帧、快照和结算跳转。
- `recordDeathForRevive` / `chooseReviveOption` 当前没有生产调用者，是遗留恢复分支；在产品明确引入“同局复活”前，不应把它列为已上线玩法，也不应为它增加在线 prompt/token 成本。

### 任务·图鉴·位置闭环与质量汇总纠偏（2026-07-15）

- 删除 `happy-economy-cycle`、`economy-currency-flow` 两条无已注册商店/商品支撑的测试；并行经济组改用已验证的 `forge-service-flow`。测试脚本不得再通过诱导模型发明商店来制造“经济覆盖”。
- `task-codex-location-flow` 首次真实运行被自动判为 5/5，但人工审计发现四类假绿：否定句“不得完成任务”仍触发完成、`playerLocation=1F` 时 `currentFloor` 仍为 3F、NPC 被测试快照带着跨房间、模型生造入住规则和职业表。
- 修复后 gameplay gate 除 feature touched 外，还要求最终 `completedTaskIds` 包含 `floor_1f_probe` 且最终位置为 `1F_PropertyOffice`；否定完成语义不能提交任务，harness 位置与楼层同步。
- 任务核对、已登记线索观察、图鉴写回、相邻移动、任务交付和该任务的关键事实对白收敛到确定性 authored lane；只允许已登记事实进入状态，不让模型决定任务完成或新增规则。
- `.runtime-data/eval/live-task-codex-location-zero-token-final-20260715/`：6/6 回合、任务/图鉴/位置门禁与最终状态门禁全过，任务仅完成一次，位置 `1F_PropertyOffice/currentFloor=1F`，总耗时 0.4 秒，0 token。改造前同活动约 69k input、32 秒且仍有世界事实错误。
- 当前精选证据汇总：7 个有结论活动、29 回合、通过率 100%、softlock/error 0、p50 16ms、p95 1576ms、结构化后果率 100%、dead-turn 0、推进回合率 24.1%。总模型输入 10,653、输出 196，其余确定性回合均为零模型。
- 综合量化分 94.35 只能视为工程健康度候选：置信度仍为 0.505，启发式主观可玩性仅 3.26/5，`continueDesire` 1.14/5；真人可玩性证据与足够回合样本仍缺失，因此目前不授权删除玩家功能。
- 自适应测试规划器现在优先选择带 `requiredFeatureOutcomes` 的可验证场景，不再在信息增益相同时优先选择只有泛化文案的探索脚本。

### 主观可玩性 cohort 与盲测工具（2026-07-15）

- 稳定性拒绝、状态核对、幂等重放和服务回合不再混入主观可玩性代理。场景必须显式设置 `subjectivePlayabilityEligible=true`，且代理只读取非 deterministic service 的故事回合。
- 纠偏前“继续游玩意愿 1.14/5”主要是行政核对尾句污染；纠偏后当前 2 个真实故事回合的启发式代理为 4.67/5，行动回报/张力/清晰度/继续意愿均为 5，选择意义仍只有 3。样本只有 2，仍不能当真人结论。
- 战斗叙事删除“具体变化以本回合状态结算为准”的机械尾注；精确数值留给结构化 delta 与客户端 digest，正文以“威胁只是暂退，还没有结束”恢复章节钩子。
- 真实 cohort 发现模型把合法的已登记战斗判成 `is_action_legal=false`，导致 settlement guard 冻结 68/1 武器变化；现由 registered mechanics 对“现有武器 + 现有威胁 + 明确攻击”权威判定合法。复跑确认理智、武器、威胁与 conflict envelope 一致。
- 连续扩样时官网生成两次 `server_internal_generation_failed`，成本断路器均在首个失败回合停止。当前合并证据为 10 个 run / 43 回合，通过率 80%、error 20%，质量分从只看成功样本的 94.35 修正为 89.26，置信度 0.68；供应商不稳定不能靠重试洗绿。
- 人工评测 exporter 现支持真实 `--input-a/--input-b` trace、`--changed-only` 和 Likert `--story-only`。已生成：
  - `.runtime-data/eval/human-ab-combat-hook-20260715/ab-worksheet.md`（3 个发生变化的盲化回合）
  - `.runtime-data/eval/human-likert-playability-20260715/likert-sheet-playability.md`（只包含 1 个真实故事回合）
- 当前决策门禁仍是 `human_playability_evidence_missing` 与 `playability_proxy_sample_too_small`；不授权根据代理分删除功能。

### 反事实选择意义测试（2026-07-15）

- 新增 `choice-shadow-attack` 与 `choice-shadow-recon`：两条分支共享完全相同的职业、武器、威胁、地点和资源初态，只改变玩家动作。
- 攻击分支必须提交 `conflict_outcome + weapon_updates + main_threat_updates`，侦察分支明确禁止这些结果；不再用“是否出现四个按钮”替代选择意义。
- `counterfactualChoice` 量化器先验证初态完全一致，再验证动作不同和结构化 outcome fingerprint 不同。只有三项同时成立才算 meaningful choice；纯文案差异会被判 `cosmetic_only_outcomes`。
- `.runtime-data/eval/live-counterfactual-shadow-choice-20260715/counterfactual-assessment.json`：真实官网选择对通过，攻击为稳定 72→68、污染 0→1、威胁压制 25%；侦察保持 72/0 且无战斗结算。攻击消耗一次模型，侦察 0 token。
- 产品质量报告现接收 `--counterfactual-results`，当前 1/1 选择对产生真实结构差异，`meaningfulChoiceRate=100%`。这只是一个机制样本，不等于全游戏选择均有意义。
- 合并当前证据为 12 个 run / 45 回合：通过率 83.3%、error 16.7%、p50 16ms、p95 5232ms、质量分 89.86/100、置信度 0.68。3 个故事样本的启发式可玩性为 4.67/5，但真人与多场景证据仍不足。

## 置信策略（防伪置信硬约束）

评分体系中，不能把高分当作高置信。`buildProductQualityScorecard` 对置信的硬约束如下：

- 只在 `narrativeConsistency` 报告内有真实 `judgeConfidence`（Model/Codex 原始置信）时，路径才是 `raw_ai`，才允许高置信。
- 无原始置信时最多进入 `judge_coverage_inferred` 或 `heuristic_only`，默认自动下压到更严格的保守上限（≤0.5），再乘以额外可靠性降权；只有在显式开启 `VERSECRAFT_EVAL_ALLOW_HEURISTIC_CONFIDENCE=1` 时，才允许按历史经验上限（≤0.72 / ≤0.68 / ≤0.62）评估。
- 输出始终带 `confidenceTrace.source`、`rawEvidenceUsed`、`evidenceComponents`、`confidencePathPenaltyReason` 与 `evidenceFloor`，不能只看 `overallScore`。
- 建议默认把 `product-quality` 报告中的 `overall_decision_confidence_low` 与 `narrative_judge_confidence_sample_missing` 当作“未通过发布前提”；
  即便综合分高，也不应以此通过删除/切线或发布结论。
