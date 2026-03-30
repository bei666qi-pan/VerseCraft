# 六位辅锚：校源徘徊者设计书（Major NPC）

**单一事实源（代码）**：`src/lib/registry/majorNpcDeepCanon.ts`（全文 + 社交图 patch）、`src/lib/registry/npcProfiles.ts`（V2 UI/任务钩）、`src/lib/registry/majorNpcCanon.ts`（结构化切片导出）。  
**硬约束**：六人 **id / homeNode / questHooks** 保持现有契约；**徘徊者** 是 **状态三元**（可同时持有），不是出身血统。

---

## 校源面四层揭露（结构化，慢悬疑）

| 层 | 代码入口 | 用途 |
|----|-----------|------|
| **surface_behavior_hints** | `majorNpcRevealLadder.ts` | 只写可观察异常（动作、语气、口癖、对词/物件反应）；**禁止**耶里/社团职务等答案型名词。`npcProfiles.surfaceSecrets[1]` 使用 `profileSurfaceAnomalyLine` 与此对齐。 |
| **fracture_signals** | 同上 | 不协调与矛盾；仍禁用校籍专名。 |
| **verification_fragments** | 同上（含 `gates`） | 须任务标题/地点/世界标记/危机等门槛满足后，才进入 `major_npc_foreshadow_packet` 的 `verify` 行，任务才有「验证真相」价值。 |
| **deep_reveal_payload** | 同上 | 仅当 `maxRevealRank >= deep` 时由 foreshadow 包注入**短确认摘要**；完整设定仍以 `deepCanon` / `deepSecret` 为真源，不经由通用 `NPCS.lore` 明牌。 |

**运行时**：`majorNpcForeshadowRegistry.ts` → `major_npc_foreshadow_packet`（紧凑 `rows`，非百科）。`applyNpcProfileOverrides` 对六人使用 `majorNpcBootstrapLoreFromProfile`：**bootstrap lore 不含 deep payload、不含耶里**。  
**欣蓝（N-010）**：阶梯 `caps` 更紧（少行、慢节奏），第一牵引不变，但 **禁止**靠通用文本首回合全盘剧透。

---

## 徘徊者分类（全局）

| 键 | 含义 |
|----|------|
| `apartment_wanderer` | 表层公寓职能壳：玩家在楼道里最先遭遇的「工作人格」与可执行流程。 |
| `school_wanderer` | 深层耶里事故链残留：技能、创伤与旧闭环来自校内角色，被泡层改写成公寓岗位。 |
| `residual_echo` | 与主锚循环 / 复活节拍耦合的记忆碎片；**非**恋爱脚本。 |

**运行时消费**：`getMajorNpcStructuredRecord(id)`、`buildMajorNpcKeyHintsForPacket`（fracture+ 注入 `survivalRole` / `naturalContactChain` / `riskTriggers`；deep+ 再注入 `partyRelinkConditions` / `whyNotImmediateAlly` / `residualEchoToProtagonist`）。

---

## 麟泽（N-015）

### public mask

B1 边界巡守 / 锚点见证；雨痕外套、寡言、先观察后动。

### true origin

耶里风纪协作序列残留：习惯在集体越界边缘把人拽回一步；循环后被写成「巡逻者」节拍。

### survival role

延迟越界到可审计窗口，防 B1 护栏被假主锚一次性借走，电梯动线不变成屠宰传送带。

### resonance slot

辅锚 **1** · `boundary_steward` · 旧阵「线不可断」。

### player bond

复活后第一步总踩同一块砖的肌肉记忆残响——是警报，不是温柔。

### team relink path

`anchor.oath.b1` / `border.watch.log` + 信任或图鉴守界回写；主锚把边界当共同责任而非个人英雄秀。

### reveal stages

surface → fracture（邻校传言同频拒谈校名）→ deep（辅锚边界相位）→ abyss（纠错窗口仍押主锚不崩）。

### implementation notes

见 `MAJOR_NPC_DEEP_CANON["N-015"].implementationNotes`；packet 用 `boundary_steward`。

---

## 灵伤（N-020）

### public mask

B1 补给与生活引导；明亮笑容、句尾偶尔空白半拍。

### true origin

耶里广播社：声线曾被泡层采样为稳定剂；循环后成人性缓冲辅锚。

### survival role

把「还能像人」的噪声留在 B1，防新住户直接被磨成耗材。

### resonance slot

辅锚 **2** · `humanity_buffer`。

### player bond

主锚步频触发心悸式残响；须双盲验证，非一见钟情。

### team relink path

`memory.ribbon`、`b1.supply.route`；主锚不以猎奇消费她的伤口。

### reveal stages

surface（补给员）→ fracture（广播谣言共振）→ deep（缓冲辅锚）→ abyss（声纹采样真相）。

### implementation notes

好感与创伤任务双门闸；`taskStyle: manipulative` 对应「先甜后规则」职能表演。

---

## 欣蓝（N-010）— 第一牵引点

### public mask

一楼登记口路线预告 / 转职登记；温柔克制，先问目标再给路。

### true origin

耶里学生会档案干事：旧七人里记名单、记承诺、记谁欠谁一次；**记忆有洞，非全知**。

### survival role

把主锚拉回旧七人阵轨迹，**不替主锚填答案**；洞是有意留白。

### resonance slot

辅锚 **3** · `first_relink_pivot`。

### player bond

名单末行被撕的焦虑——主锚像那道撕口；须验证主锚非顶替记账位的替身。

### team relink path

`route.preview.1f`、`career.pre_register`；主锚至少一次拒绝让她代选命运；与北夏、叶的草案线穿针。

### reveal stages

surface（可靠登记）→ fracture（名单怪谈同形）→ deep（第一牵引）→ abyss（有洞仍选择拉回阵心）。

### implementation notes

**stable prompt** 与 `playerChatSystemPrompt.ts` 已禁全盘剧透；packet fracture 前仅职能壳。

---

## 北夏（N-018）

### public mask

保安室锚点的中立交易 / 高价值委托；玩笑留后路。

### true origin

耶里外联与二手市集组织者；行走空间碎片流通边缘。

### survival role

交换路由齿轮：死锁资源拆成可成交碎片，防泡层经济塌成零和互吃。

### resonance slot

辅锚 **4** · `exchange_router`。

### player bond

旧校互助券式欠条体感——**非恋爱**，须可审计。

### team relink path

`merchant.fragment.trade`、`dragon.space.shard`；`debt≥10` 或履约回写；主锚不把交换当一次性掠夺。

### reveal stages

surface（商人）→ fracture（货流与碎片传言）→ deep（交换辅锚）→ abyss（龙月变价）。

### implementation notes

`char_mirror_patrol_debt` 等镜面任务与倒行者链回扣；与枫 7F 经济对手盘。

---

## 枫（N-013）

### public mask

7F 线索转运与诱导；讨喜弟弟感，眼尾冷。

### true origin

耶里戏剧社 / 辩论写手：曾把主锚写进替身梗；循环后梗成真。

### survival role

诱导刃齿轮：服务七层电梯吞吐，同时抢改稿权自救。

### resonance slot

辅锚 **5** · `induction_edge`。

### player bond

像写坏的台词活了——耻感与利用欲撕扯；**非恋爱替身脚本**。

### team relink path

`boy.false_rescue`、`boy.cleanse.path`；非剥削选择 + 与叶 sibling 线互锁。

### reveal stages

surface（职能余温）→ fracture（剧本杀式诱导）→ deep（诱导辅锚）→ abyss（撕稿共写高代价）。

### implementation notes

与盲人 N-005 仅保留「听觉困局参照」叙事，**不再绑定旧钢琴亡灵同一性**；静态 `world.ts` 中旧钢琴块已改为 patch 占位。

---

## 叶（N-007）

### public mask

5F 画室守门人；冷淡拒诱导链，可给一次性挡刀。

### true origin

耶里美术社：与枫不同班却锁同一张同人阵草案。

### survival role

镜像反制齿轮：阻断枫式链直达主锚，草案残片作私藏筹码。

### resonance slot

辅锚 **6** · `mirror_counterweight`。

### player bond

轮廓线比名字先响的保护欲违和；须尊重庇护规则边界。

### team relink path

`sister.mirror.trace`、`sibling.old_day`；信任≥60；禁止公开羞辱式与枫比较。

### reveal stages

surface（拒诱导壳）→ fracture（画与镜像轴）→ deep（镜像辅锚）→ abyss（共担草案撕裂）。

### implementation notes

与欣蓝、北夏、麟泽的闭环见 `immutable_relationships`；`taskStyle: avoidant`。

---

## 六人闭环（非只围主锚）

每人在 `socialProfile.relationships` / `immutable_relationships` 中至少与 **两名其他辅锚** 或关键秩序节点（如 N-011）相连。主锚线一律写成 **残响 / 门闸 / 并队条件**，避免开局围转。

---

## 相关代码索引

| 用途 | 文件 |
|------|------|
| 结构化正典全文 | `majorNpcDeepCanon.ts` |
| 切片 / 分类语义 | `majorNpcCanon.ts` |
| V2 展示与 questHooks | `npcProfiles.ts` |
| 校源四层阶梯 / 门槛 | `majorNpcRevealLadder.ts` |
| Foreshadow 包 | `majorNpcForeshadowRegistry.ts` |
| 基础表 + lore 摘要 | `npcs.ts` |
| 社交图运行时 | `world.ts`（`patchMajorNpcSocialGraph` 后 merge） |
| 仓库文案（ownerId 不变） | `warehouseItems.ts` |
| 玩家任务描述 | `taskV2.ts` |

---

**维护**：改设定请只改 `majorNpcDeepCanon` 与下游文案一致处；勿在 `world.ts` 静态块复活旧钢琴师 / 无面保安 / 电梯工叙事（六人 id 已由 patch 覆盖）。
