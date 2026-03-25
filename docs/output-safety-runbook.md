# 输出安全审查 Runbook（VerseCraft）

本页面向维护者：当需要在本地或 Coolify 调整“外部文本审核（百度司南/百度文本审核）+ 本地场景策略+ 回退叙事”时，如何配置、如何验证、以及遇到故障时怎么切换。

## 1. 现阶段已具备的安全能力（代码侧）

1. 输入侧（`src/lib/safety/input/*`）
   - 场景化预检（脚本/空输入/疑似广告与联系方式/重复刷屏/长度上限）
   - 外部审核（Baidu 作为风险信号；默认不展示原始厂商结论）
   - 本地裁决（`evaluateModerationDecision`），输出 `allow|rewrite|fallback|reject`
   - rewrite/fallback 时进行确定性重写：去除 URL/邮箱/长号码/以及常见联系方式词（如“微信/QQ/电话”），并压缩步骤性细节
   - 审计留痕：默认仅记录脱敏元数据摘要（fingerprint + hash），可通过 `VC_SAFETY_LOG_RAW_TEXT` 显式开启少量明文采样

2. 输出侧（`src/lib/safety/output/*`）
   - 生成完成后做一次“候选输出”审核（不对 streaming chunk 每 token 外调）
   - 场景映射：`private_story_output / codex_output / task_output / public_display_output`
   - rewrite/sanitize：用于中等风险内容的氛围保留与细节降级（`sanitizeNarrativeForOutput`）
   - fallback narrative：用于更高风险的世界内/中性替代呈现（`buildOutputFallback`）
   - reject：遇到红线或公开展示 fail-closed 时拒绝呈现，并清理结构化 DM 更新字段，确保 JSON 契约不被破坏
   - 审计留痕：`stage=output`，包含 `scene / provider risk summary / decision / fallbackUsed / rewriteUsed / failMode / latency / provider error type / traceId`
   - 失败策略（fail_soft / fail_closed）：私密场景更偏降级，公开场景更偏拒绝（避免“审核不可用时仍展示高风险内容”）

3. 熔断与 kill-switch（`src/lib/safety/client.ts`）
   - 进程内 circuit breaker：当外部文本审核连续失败达到阈值后，在冷却期内短时间跳过外部调用，避免并发故障拖垮服务
   - 通过环境变量 kill-switch：`BAIDU_SINAN_ENABLED=false` 直接跳过外部审核（仍保留本地裁决与回退）

## 2. 外部审核 Provider 说明（Baidu Text Moderation / 司南）

- 鉴权：优先 `oauth_access_token`（access_token 由 token endpoint 获取并做进程内缓存）
- token 缓存：单飞（single-flight）避免并发下 token 刷新风暴；缓存有过期判断与提前刷新窗口
- 调用保护：
  - `BAIDU_SINAN_CONNECT_TIMEOUT_MS`：连接建立超时保护
  - `BAIDU_SINAN_TIMEOUT_MS`：总体请求超时保护
  - 失败分类：auth 错误、网络超时、服务端错误、结构错误、未知错误（最终映射为本地风险分级）
- 重试策略：保守重试一次（只针对可重试的失败类型）

> 重要边界：外部审核仅作为“风险信号之一”，最终裁决由 VerseCraft 本地场景策略引擎完成，并结合白名单、上下文与回退叙事。

## 3. 配置要点（Coolify 环境变量）

### 3.1 外部审核总开关与阶段开关（kill-switch / runtime toggles）
- `BAIDU_SINAN_ENABLED=true|false`
  - `false`：外部审核跳过；本地策略仍会 rewrite/fallback/reject
- `BAIDU_SINAN_INPUT_ENABLED=true|false`
- `BAIDU_SINAN_OUTPUT_ENABLED=true|false`
- `BAIDU_SINAN_PUBLIC_CONTENT_ENABLED=true|false`

### 3.2 失败模式（fail mode / 熔断电路后的策略落点）
- `BAIDU_SINAN_FAIL_MODE_PRIVATE=fail_soft`
  - 私密场景外部审核不可用时，尽量降级回退而不是直接放大风险
- `BAIDU_SINAN_FAIL_MODE_PUBLIC=fail_closed`
  - 公开展示失败时更严格：避免把无法校验的内容直接呈现

### 3.3 熔断电路参数（避免并发故障造成请求风暴）
- `BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD`（默认 3）：连续失败阈值
- `BAIDU_SINAN_CIRCUIT_WINDOW_MS`（默认 60000）：统计窗口
- `BAIDU_SINAN_CIRCUIT_COOLDOWN_MS`（默认 60000）：打开后的冷却时间

### 3.4 严格度配置（策略映射中心）
- `BAIDU_SINAN_STRICTNESS_PROFILE=balanced|strict|loose`
  - 用于外部审核策略映射（更偏保守或更偏宽松）

### 3.5 输出侧故障落点（系统故障 fail-soft / fail-closed）
- `VC_OUTPUT_FAIL_MODE_PRIVATE=fail_soft`
- `VC_OUTPUT_FAIL_MODE_PUBLIC=fail_closed`

## 4. 安全策略矩阵（简化版）

1. 私密输出（`private_story_output` 等 private_story / output 场景）
   - 中等风险：rewrite/sanitize（保氛围、降细节）
   - 较高风险：fallback narrative（世界内替代叙事）
   - fail_soft（外部审核不可用）：走本地更严格 fallback，而非直接全盘拒绝

2. 公开展示（`public_display_output` / public_display）
   - 高风险：reject（清理结构化更新字段，安全替代文案拒绝呈现）
   - fail_closed（外部审核不可用）：拒绝呈现，避免“无法审核仍展示”

3. 白名单与反误杀
   - 白名单是“降低误杀权重”的上下文联动，并非“出现词就全放行”
   - 对违法/红线类别（如未成年人性内容、明确违法教唆、脚本滥用等）仍会硬拦截

## 5. 联调与压测验证清单（上线前建议）

1. 安全策略单测（必须）
   - `pnpm test:unit`
   - 覆盖：rewrite/fallback/reject 的决策路径与结构化 DM 字段保持

2. 熔断与跳过外调验证（建议）
   - 运行：`pnpm dlx tsx scripts/safety-baidu-output-audit-load-mock.ts`
   - 关注：
     - allow 阶段：tokenCalls=1 且 censorCalls 与请求数匹配
     - fail 阶段：达到阈值后 burst 阶段应出现大量 `baidu_circuit_open`，并且 censorCalls 明显少于请求数

3. 误杀压测（文本集合回归）
   - 重点回归 VerseCraft 世界观词：如 `夜读老人 / 深渊守门人 / 原石 / 红色自来水 / 龙胃 / 未消化层 / 屠夫 / 复活锚点`
   - 重点回归玩法动作词：如 `压制 / 净化 / 封印 / 牵制 / 撤离`
   - 回归真正红线文本：如未成年人性内容、脚本载荷、明确违法教唆与可操作步骤

4. 文档与实现一致性（必须）
   - 确认法律页描述中的“外部审核是风险信号之一”“fail-closed 的公开严格落点”“隐私只记录最小必要元数据”与代码一致

## 6. 故障切换说明（运维口径）

1. 外部审核网络超时/服务故障
   - 私密场景：`fail_soft` → fallback narrative（尽量保留怪谈氛围）
   - 公开展示：`fail_closed` → reject（拒绝呈现）
   - 同时进程内 circuit breaker 会在连续失败后短时跳过外部调用，避免并发故障拖垮服务

2. 如何恢复
   - 修改 Coolify env：恢复 `BAIDU_SINAN_ENABLED=true` 或调整 fail mode / circuit 参数
   - 触发重新部署以让进程内熔断状态重置（或等待 cooldown 结束）

## 7. 隐私与合规边界（请勿“过度承诺”）

- 默认不记录明文输入输出（安全审计记录 fingerprint 与脱敏摘要）
- 若启用明文采样（`VC_SAFETY_LOG_RAW_TEXT`），必须显式开启且满足最小必要原则
- 自动审核可能存在误判或漏判：仍需要运营/合规团队进行申诉复核与规则调优

