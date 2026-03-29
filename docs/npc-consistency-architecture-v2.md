# NPC 一致性架构 v2：专项审计与落地定稿

**文档性质**：阶段 1 审计结论 + 架构定稿（不写 UI、不破坏 JSON/SSE 契约）。  
**版本**：v2-draft-2026-03-29  
**关联阅读**：`docs/stage1-dm-prompt-architecture.md`、`docs/prompt-integration-school-cycle.md`

---

## 1. 问题根因拆解

### 1.1 性别错位

| 根因 | 说明 |
|------|------|
| **缺少「规范代词/性别」权威字段** | `registry/types.ts` 中 `NPC` / `NpcDisplayLayer` 以 `appearance` 自由文本为主；`key_npc_lore_packet.nearbyNpcBriefs`（见 `worldLorePacketBuilders.ts`）只注入 `id/name/appearance`，未强制结构化「生理/社会性别表现、代词」供模型绑定。 |
| **模型先验补全** | 当 brief 过长被截断、快车道无 runtime JSON、或 minimal 模式压缩上下文时，模型用训练语料中的常见性别刻板印象补全。 |
| **多数据源潜在不一致** | 若 UI/存档/旧表与 `NpcProfileV2`/社交图存在多套叙事描述，仅部分进入 packet，模型会「综合脑补」成第三套。 |

### 1.2 地点错位

| 根因 | 说明 |
|------|------|
| **场景权威与叙事权威的竞态** | `runtimeContextPackets.ts` 从 `playerContext` 正则解析 `用户位置[...]` 与 `NPC当前位置：...`，再与 `fallbackLocation` 合并；若客户端字符串格式漂移、或压缩回合丢失片段，解析结果与真实状态可能短暂不一致。 |
| **JSON 截断** | `buildRuntimeContextPackets` 在超长时用 `slice(0, maxChars)` 截断 compact 包，战术/楼层类键可能被挤掉，模型转而依赖模糊记忆或 plot 摘要。 |
| **DM 在 narrative 中写 `player_location`** | stable 要求使用运行时节点 ID，但模型仍可能输出错误节点；若无服务端对 narrative 中地名的强校验，错位会进入玩家感知。 |

### 1.3 NPC 人设与背景「胡编」

| 根因 | 说明 |
|------|------|
| **`plot_summary` 与「角色台词素材」边界仍依赖自觉** | `memoryCompress.ts` 明确 `plot_summary` 偏 DM 编排、压缩 prompt 要求不把系统真相写入 NPC 快照；但压缩与摘要仍由另一路 LLM 生成，失败时虽有 `safeFallbackEpistemicMemory`，成功时仍可能出现「摘要里写了具体人名关系」被下游误用。 |
| **Registry 分层未全部参与每回合注入** | `NpcProfileV2`、`NpcSocialProfile.fixed_lore`、`MAJOR_NPC_DEEP_CANON` 等存在于 registry，但注入路径分散（packet、RAG、心核）；**快车道空包**时（见 `route.ts` + `prompt-integration-school-cycle.md`），stable 只有边界句，事实密度不足，模型倾向编造可讲故事的细节。 |
| **焦点 NPC 缺失时的叙事主体模糊** | `resolveEpistemicTargetNpcId`（`targetNpc.ts`）在「多人在场且无 N-xxx / 无唯一在场者」时返回 `null`，`actorNpcId` 为空则认知块与 epistemic profile 无法锚定到具体角色，模型以「通用 NPC」口吻编造。 |

### 1.4 对玩家态度不像「误闯学生」

| 根因 | 说明 |
|------|------|
| **缺少显式「基线态度」数据层** | `npcHeart/types.ts` 有 `attitudeLabel` 等，但未与「世界规则：普通租户视角」在 **每条请求** 上强制合并为可执行条目的单一事实包。 |
| **关系数值被误读为「旧识」** | `npc_relationships` 与图鉴 hint 进入记忆块后，模型易把「数值/标签」解释成剧情上的亲密相识，而非系统性的好感刻度。 |
| **Stable 未写死「普通 NPC 默认陌生人」短句的可机读版本** | 当前依赖长文规则 + 模型遵守；缺少与 `NpcEpistemicProfile` 同级的 **baseline_attitude_packet**（见 §4）由服务端生成。 |

### 1.5 普通 NPC 知道不该知道的事

| 根因 | 说明 |
|------|------|
| **全局 DM 摘要历史路径** | `actorScopedMemoryBlock.ts` 已用 `buildActorScopedEpistemicMemoryBlock` 替代「全量注入」；但若 `actorNpcId` 为空或事实合并（lore + session）过大，`filterFactsForActor` 的边界仍可能被漏网事实或错误 scope 穿透。 |
| **知识事实来源多样** | `route.ts` 合并 `loreFactsToKnowledgeFacts` 与 `sessionMemoryRowToKnowledgeFacts`；若 session 压缩把玩家独知写进错误 scope，守卫只能事后缓解。 |
| **欣蓝与常人的策略未在数据层枚举穷尽** | `epistemic/policy.ts` 仅区分 `XINLAN_NPC_ID` 与其余默认策略；**六位高魅力**与**夜读老人**的「可知情/可牵引」差异仍大量依赖 packet 与 prompt，而非统一策略表驱动。 |

### 1.6 欣蓝 / 高魅力 / 夜读老人 / 普通 NPC 权限边界混乱

| 根因 | 说明 |
|------|------|
| **权限维度未收敛为单一注册表** | 「是否记得周目」「残响强度」「可否点破校源」「可否主动给名单」分散在：`NpcMemoryPolicy`、`MAJOR_NPC_DEEP_CANON`、`major_npc_*_packet`、`xinlan-anchor` 文案、sanitize（`memoryCompress` 对非欣蓝 `recognized_loop` 的降级）。缺少 **canonical_id → { tier, caps }** 的机器可读一行表。 |
| **Reveal 档位与 epistemic 事实门闸双轨** | `reveal_tier_packet` 控制叙事深度；`NpcEpistemicProfile` 控制记忆与惊讶阈值；两者未在类型层声明「谁必须随 reveal 联动」，易出现「档位未到但台词像全知」。 |

---

## 2. 新架构总览

在 **不推翻** 现有「Stable + Runtime JSON + 分层记忆 + 认知守卫 + 后验校验」的前提下，增加五层语义清晰的薄层，使 **权威数据 → 可执行上下文 → 生成 → 校验** 闭环可测、可灰度。

```
[Registry 正典] 
    → Canonical Identity Layer（谁：ID、称谓、性别表现、职能壳）
    → Baseline Attitude Layer（对「误闯学生」的默认立场 + 例外标记）
    → Scene Authority Layer（本回合：地点、在场者、主威胁、服务节点）
    → Actor-Scoped Epistemic Layer（焦点 NPC：可知事实 + 禁知 + 残响模式）
    → LLM（DM 生成，JSON 契约不变）
    → Post-Generation Consistency Validator（结构化抽查/重写触发，已有 telemetry 可扩展）
```

**原则**：能进注册表与结构化 packet 的，不写进超长 prompt；能由服务端算清的，不交给模型猜。

---

## 3. 世界观硬规则（写死）

以下与产品共识一致，实施时进入 **registry 常量 + runtime packet 字段 + 校验器关键词**，而非仅 stable 文案。

1. **普通 NPC** 默认将玩家视为受空间碎片影响、**误闯诡异公寓的学生之一**（非天选唯一、非默认旧识）。
2. **仅 6 位高魅力 NPC**（`MAJOR_NPC_IDS`）与 **夜读老人（N-011）** 可对玩家产生 **熟悉感 / 异样感 / 牵引感** 的叙事特权；强度与揭露进度仍受 `reveal_tier` 与专用子包约束。
3. **欣蓝（N-010）** 在设定上接近全知，但 **必须分层揭露**：禁止单回合输出完整根因链、七锚细节、通关链；与现有 `xinlan-anchor`、`sanitizeEpistemicCompressedMemory` 中非欣蓝权限限制一致。
4. **普通 NPC** 不得默认认识主角；不得默认知晓其他 NPC 的私密事实。
5. **情绪残响** 仅允许模糊体感（停顿、目光、不安），**不等于**可核对的具体记忆或秘密命题（与 `npc_epistemic_residue_packet`、压缩层 `emotional_residue_markers` 一致）。
6. **性别、地点、称谓、身份、立场、可知范围** 以 **registry + runtime authority**（解析后的 location、在场 NPC、packet）为准；模型不得覆盖。

---

## 4. 技术落地分层

### 4.1 Canonical Identity Layer（规范身份层）

**目标**：任何进入模型的 NPC 相关句，都能追溯到 `id` 与最小规范属性集合。

| 内容 | 落地 |
|------|------|
| 稳定 ID、显示名、称谓规则 | 延续 `NPC.id` / `NpcProfileV2`；新增或扩展 **只读** 字段：`canonicalPronouns` 或 `genderPresentation`（枚举），写入 registry 数据源，由 `buildKeyNpcLorePacket` 一并注入 `nearbyNpcBriefs`。 |
| 外貌 | 继续 `appearance`，与 stable 中「首次出场用 brief」对齐；禁止模型在已登记「已描写」后重复堆叠。 |
| 职能壳 vs 深层身份 | 继续由 `MAJOR_NPC_DEEP_CANON.publicMaskRole` + reveal 控制；identity layer 只负责 **壳层措辞** 的权威引用。 |

**与现有文件**：`src/lib/registry/types.ts`、`majorNpcDeepCanon.ts`、NPC 主表（如 `NPCS` 引用处）、`worldLorePacketBuilders.ts`。

### 4.2 Baseline Attitude Layer（基线态度层）

**目标**：每回合对每个「可能开口的 NPC」给出服务端计算的 **对玩家基线**，避免模型默认「熟人/敌对剧本」。

| 内容 | 落地 |
|------|------|
| 默认：陌生 + 警惕/事务性 | 枚举 `stranger_tenant_student` 等，写入新 packet 小节 `baseline_attitude_packet`（或在 `actor_epistemic_scoped_packet` 内增加只读字段）。 |
| 例外：高魅力 / 夜读 / 欣蓝 | 由 `MAJOR_NPC_IDS` + `N-011` + 策略表打标，叠加关系值仅作 **微调**，不单独升格为「旧友」除非 reveal + 关系阈值满足。 |

**与现有文件**：`npcHeart/types.ts`（`attitudeLabel` 可对齐）；`epistemic/policy.ts`（扩展非「仅欣蓝二元」）；`route.ts` 组装 prompt 处。

### 4.3 Scene Authority Layer（场景权威层）

**目标**：本回合「在哪、谁在场、环境威胁」单一真相，减少地点与多人场景错位。

| 内容 | 落地 |
|------|------|
| 解析后的 `locationId` / `floorId` | 已有 `current_location_packet`；加强 **与 `guessPlayerLocationFromContext` 结果一致性校验**（服务端断言或单测）。 |
| 在场 NPC 列表 | 已有 `nearby_npc_packet` / `extractPresentNpcIds`；对「焦点 NPC 为空」时注入 **显式 disambiguation hint**（例如：「多人在场，勿代任一角色确认他者秘密」）。 |
| 截断策略 | 调整 `maxChars` 优先级，保证 `current_location_packet` + `key_npc_lore_packet` 关键键在截断后仍保留（已有 compact 路径，可微调顺序而非推翻）。 |

**与现有文件**：`runtimeContextPackets.ts`、`playRealtime/b1Safety`（在场提取）、`route.ts`。

### 4.4 Actor-Scoped Epistemic Layer（演员范围认知层）

**目标**：焦点 NPC **只知道**允许集合；残响与全知分离。

| 内容 | 落地 |
|------|------|
| 事实过滤 | 延续 `actorScopedMemoryBlock.ts` + `guards.ts` + `buildNpcEpistemicProfile`。 |
| 焦点解析 | 强化 `resolveEpistemicTargetNpcId` 的 **可观测日志与降级策略**：多人场景无焦点时，注入 **多角色公共规则**，而非默认单人深聊。 |
| 欣蓝分层 | `getDefaultMemoryPolicyForNpc` + `sanitizeEpistemicCompressedMemory` + reveal 联动；增加 **按 reveal_rank 裁剪 fact 类别** 的配置（数据驱动）。 |
| 压缩 | `memoryCompress.ts` 保持分层 JSON；对压缩模型输出增加 **schema 校验**（可选阶段）：`knownFactIds` 必须属于注册 fact 前缀白名单。 |

**与现有文件**：`epistemic/*`、`memoryCompress.ts`、`playerChatSystemPrompt.ts`（仅引用 packet 名，不写长设定）。

### 4.5 Post-Generation Consistency Validator（生成后一致性校验器）

**目标**：在 **不破坏 SSE/JSON 形状** 的前提下，对 `narrative`（及必要时的结构化字段）做规则/轻量模型二次检查。

| 内容 | 落地 |
|------|------|
| 禁词/禁模式 | 普通 NPC 台词中若出现「校源闭环/七锚全名」等，标 `validatorTriggered`（已有 telemetry 字段可复用）。 |
| 代词与 ID | 若 narrative 出现与 `nearbyNpcBriefs` 冲突的性别描述，记录并可选触发 **窄重写**（仅 narrative 字段，保持其它键不变）。 |
| 地点 | 若 `player_location` 与 `current_location_packet` 冲突，以服务端覆盖或打标修正（延续现有 guard 模式）。 |

**与现有文件**：`src/lib/epistemic/validator.ts`、`route.ts` 流式结束后的处理分支。

---

## 5. 与现有文件的映射关系

| 模块 | 文件路径 | v2 中的角色 |
|------|-----------|-------------|
| Registry 类型 | `src/lib/registry/types.ts` | 扩展规范身份字段的宿主 |
| 高魅力正典 | `src/lib/registry/majorNpcDeepCanon.ts` | 权限与揭露阶段的叙事来源 |
| 心核类型 | `src/lib/npcHeart/types.ts` | `epistemicProfile`、态度与 runtime 对齐 |
| Stable DM | `src/lib/playRealtime/playerChatSystemPrompt.ts` | 保持短边界；世界规则以 packet 为准 |
| Runtime Packets | `src/lib/playRealtime/runtimeContextPackets.ts` | 注入 identity / baseline / scene 的主入口 |
| 记忆与压缩 | `src/lib/memoryCompress.ts` | 分层记忆与 sanitize；压缩质量监控 |
| Chat 路由 | `src/app/api/chat/route.ts` | 组装顺序、快车道、epistemic 与 validator |
| 学制集成说明 | `docs/prompt-integration-school-cycle.md` | minimal/full/快车道与 reveal 一致性依据 |
| Stage1 架构 | `docs/stage1-dm-prompt-architecture.md` | 三层结构与观测指标 |

---

## 6. 分阶段实施计划

| 阶段 | 内容 | 触碰面 |
|------|------|--------|
| **P0** | 文档与单测基线：焦点 NPC 为空、多人场景、minimal、fastlane 空包的 **预期行为** 用例 | 测试目录 + 少量 mock |
| **P1** | Registry：为 NPC 增加最小 **规范身份** 字段；`nearbyNpcBriefs` 注入；不改 JSON 契约 | registry + `worldLorePacketBuilders` |
| **P2** | `baseline_attitude_packet` 或服务端等价结构；与 `MAJOR_NPC_IDS` / N-011 打标 | `runtimeContextPackets` + `epistemic/policy` 小步扩展 |
| **P3** | Scene：截断优先级与多人场景 disambiguation 提示 | `runtimeContextPackets`、`route.ts` |
| **P4** | Validator：禁模式检测 + telemetry；可选 narrative 窄重写 | `validator.ts`、`route.ts` |
| **P5** | 压缩 schema 校验 / fact 白名单（可选） | `memoryCompress.ts` |

---

## 7. 每阶段验收标准

| 阶段 | 验收 |
|------|------|
| P0 | 关键路径单测覆盖：无焦点、双人在场、快车道跳过 runtime、minimal；文档中列出的「错误模式」均有对应断言或人工脚本 |
| P1 | 任意 NPC 在 packet 中具备规范代词/性别表现字段；同一 ID 在 UI 与 DM 侧名称一致；回归测试通过 |
| P2 | 普通 NPC 对白在抽检中显著减少「默认旧识」；高魅力/N-011 仍可有控制下的异样感 |
| P3 | 地点与在场 NPC 与 `playerContext` 解析不一致率可观测并趋近于 0（通过日志） |
| P4 | `validatorTriggered` 可解释；严重错位时触发修正或安全降级且不破坏 SSE |
| P5 | 压缩输出非法 fact 比例下降；失败回退路径仍安全 |

---

## 8. 风险与回滚策略

| 风险 | 缓解 |
|------|------|
| Token 增长 | Identity/baseline 用紧凑枚举与短字段；优先塞进现有 packet 而非新增长篇 stable |
| 快车道更「干」 | 保持 `AI_CHAT_FASTLANE_SKIP_RUNTIME_PACKETS` 可配置；P1 后即使跳过 JSON，brief 仍可从其它路径补（需评估 TTFT） |
| Registry 迁移成本 | 字段全可选，默认从 `appearance` 推断展示，逐步填满 |
| 校验误杀 | Validator 先 **只记录 telemetry**，再灰度 `rewrite`；随时 feature flag 关闭 |

**回滚**：所有新行为默认 **feature flag**；关闭后回退到当前 `main` 行为；文档版本号保留便于对照。

---

## 9. 附录：现有机制中已存在的「正确方向」

- **actor-scoped 记忆**（`actorScopedMemoryBlock.ts`）替代全局 plot 进台词。
- **认知异常包**（stable 中 `npc_epistemic_alert_packet`）与 **残响包**分离。
- **reveal_tier** + school/major 子包门闸（`runtimeContextPackets` + revealRegistry）。
- **欣蓝 sanitize**（`memoryCompress.ts` 对 `recognized_loop` 与非欣蓝 fact 的过滤）。
- **后验 validator 与 telemetry**（`route.ts` 中 `epistemicPostValidator` rollup）。

v2 的目标是把这些 **收口成可注册表驱动、可测试、可灰度** 的闭环，而不是另起炉灶。
