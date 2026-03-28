# 六位高魅力 NPC：双层身份与校源徘徊者设计

> 代码主源：`src/lib/registry/majorNpcDeepCanon.ts`、`npcProfiles.ts`、`world.ts`（patch+merge）、`npcs.ts`（基表与覆盖一致）。  
> Runtime：`key_npc_lore_packet.major_npc_bridge_hints`（`worldLorePacketBuilders.ts`）。

---

## 共通框架

| 概念 | 说明 |
|------|------|
| **apartment_wanderer** | 表层：在公寓生态里承担**可识别的职能**（登记、补给、边界、交易、诱导、庇护），不是开局围着你转的队友。 |
| **school_wanderer** | 深层：耶里学校碎片泄露的卷入者残留，被泡层改写成楼内角色。 |
| **residual_echo** | 对**主锚（玩家回声）**的肌肉记忆/心悸/欠条感/轮廓违和等，**非恋爱模板**，而是剧情齿轮与阵法残响。 |
| **七辅锚** | 固定六 id：`N-015`…`N-007`（见 `MAJOR_NPC_IDS`），与主锚构成七锚；**并队＝旧七人阵重连**，非「立即组队」。 |
| **欣蓝牵引** | `teamBridgeRole: first_relink_pivot`：旧七人阵**第一牵引点**；**非全知**，靠**不完整情感记忆 + 旧闭环牵引**把主锚拉回阵。 |

---

## 麟泽（N-015）

- **Public mask**：B1 边界巡守、锚点见证；雨痕外套、短句低声。
- **True origin**：耶里风纪协作序列；碎片夜执勤残留。
- **Survival role**：辅锚之一「边界相位」——封线/放行节拍防 B1 被当压力测试场。
- **Emotional anchor**：对主锚**复活后第一步**的肌肉记忆；冷硬下的善良。
- **Team relink logic**：先证主锚非系统试探变量；`anchor.oath.b1` + `trust>=55` + 守界可验证行为后才谈并队。
- **Reveal stages**：surface 守夜人 → fracture 邻校传言同频 → deep 辅锚 → abyss 纠错窗口下仍押注主锚。
- **Implementation**：`resonanceSlot: 1`；`questHooks` 保留 `anchor.oath.b1`、`border.watch.log`；`homeNode: B1_SafeZone`。

---

## 灵伤（N-020）

- **Public mask**：B1 补给、生活引导；明亮笑容与空白眼神半拍。
- **True origin**：耶里广播社；声纹被泡层采样作稳定噪声。
- **Survival role**：辅锚之二「人性缓冲」——防止日常感崩塌拖主锚进污染。
- **Emotional anchor**：主锚靠近时**心悸**（步频 vs 广播试音残响）。
- **Team relink logic**：忌猎奇创伤；`memory.ribbon` + `favorability>=45` 后才可能并队。
- **Reveal stages**：surface 被护着的补给员 → deep 声纹与校源标签。
- **Implementation**：`resonanceSlot: 2`；`homeNode: B1_Storage`；quest 键不变。

---

## 欣蓝（N-010）— 核心牵引

- **Public mask**：一楼物业口路线预告、转职登记；温柔御姐、先问目标再给建议。
- **True origin**：耶里学生会**档案干事**；旧七人里「记名单、记承诺」的人。
- **Survival role**：辅锚之三 + **first_relink_pivot**：把主锚拉回旧阵而不**伪造闭环**。
- **Emotional anchor**：名单末行被撕的焦虑；主锚像**撕口**本身（非全知预视）。
- **Team relink logic**：主锚必须**拒绝让她代选命运**；`career.pre_register` + `trust>=50`；防「替身顶替记账位」。
- **Reveal stages**：surface 可靠登记 → fracture 与「名单」怪谈同形 → deep 第一牵引点 → abyss 记忆有洞仍选择拉人。
- **Implementation**：`homeNode: 1F_PropertyOffice`；与 N-011 叙事改为「登记壳层可被调度」；跨 NPC 文中「物业经理(N-010)」已改为**欣蓝/登记口**语义。

---

## 北夏（N-018）

- **Public mask**：中立交易、高价值委托；玩笑留后路。
- **True origin**：耶里外联、二手市集组织者；碎片流通边缘。
- **Survival role**：辅锚之四「交换路由」——死锁资源盘活，**对价**优先。
- **Emotional anchor**：与主锚**欠条式**体感（互助券没撕干净）。
- **Team relink logic**：无偿跟队会破坏规则；`merchant.fragment.trade`、`debt>=10`、可审计履约后才并队。
- **Reveal stages**：surface 商人 → deep 辅锚与碎片链。
- **Implementation**：`homeNode: 1F_GuardRoom`；`combatPowerDisplay: "?"` 保留；**不再承担**旧「无面保安/双胞胎镜像分辨」设定（N-009 文案已改为与北夏无旧契）。

---

## 枫（N-013）

- **Public mask**：7F 线索转运与诱导；示弱、推责、高好感温顺突变。
- **True origin**：耶里戏剧社；曾把主锚写进**替身梗**。
- **Survival role**：辅锚之五「诱导刃」——危机剧本化，兼自救改稿。
- **Emotional anchor**：主锚像**写坏的台词活了**；耻感 + 利用欲。
- **Team relink logic**：主锚拒当耗材且愿给生路；`boy.*` 任务与 `betrayal_flag:boy` 条件保留兼容。
- **Reveal stages**：surface 弟弟感 → deep 校源徘徊者 → abyss 撕稿共著（高代价）。
- **Implementation**：`homeNode: 7F_Room701`；与盲人（N-005）关系改为**话术/钢琴残响病态共鸣**（非前世钢琴师双设定）。

---

## 叶（N-007）

- **Public mask**：5F 画室庇护、反向线索；冷淡抱臂、偷看反应。
- **True origin**：耶里美术社；与枫**同锁旧草案**。
- **Survival role**：辅锚之六「镜像反制」——阻断诱导链直达主锚。
- **Emotional anchor**：主锚**轮廓/步态**触发保护欲违和。
- **Team relink logic**：禁公开拿她与枫羞辱式比较；`sibling.old_day` + `trust>=60`。
- **Reveal stages**：surface 拒人千里 → deep 反制辅锚。
- **Implementation**：`homeNode: 5F_Studio503`；与双胞胎轮廓线保留。

---

## Implementation notes

1. **类型**：扩展字段集中在 `majorNpcDeepCanon.ts`，`NpcProfileV2` 不强制新增必选字段；`schoolCycleTag` 在 `deepSecret` 内用字符串叠 `apartment_wanderer | school_wanderer | residual_echo`。
2. **社交图**：`patchMajorNpcSocialGraph` **整段覆盖**六 id，避免旧「电梯工/物业经理/钢琴师」块残留；`world.ts` 末尾 merge 同步 `homeNode`、speech、`fixed_lore` 三件套。
3. **NPCS_BASE**：六人名称/节点/专长与 profile 对齐，避免未覆盖路径漂移。
4. **Packet**：`major_npc_bridge_hints` 含 `resonanceSlot`、`teamBridgeRole`、`wandererSubtype`、按 `maxRevealRank` 过滤的 `revealHints`。
5. **勿做**：不要把六人写成纯恋爱对象；并队条件保持**任务/信任/债务**等可系统回写钩。

---

*文档与实现同步迭代；改人设请同时改 `majorNpcDeepCanon` + `npcProfiles` +（必要时）跨 NPC 边。*
