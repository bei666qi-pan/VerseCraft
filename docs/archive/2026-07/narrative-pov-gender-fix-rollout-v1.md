## VerseCraft 统一叙事裁决层：连贯性 / 第一人称 / 性别代词（v1）

本方案把三类问题（复述与断裂、POV 漂移、性别代词错）从“各修各的 prompt/patch”升级为**统一后置裁决层**（composite narrative quality guard），并提供灰度开关、观测与 golden 回归测试，降低回退风险与线上波动。

---

### 1) 三个 bug 的根因（复盘）
- **叙事重复/不连贯**：`route.ts` 曾将“系统暗骰/玩家输入原文/写作要求”强标签塞入最后一条 user message，诱导模型进入“翻译/复述/解释动作”模式；生成后缺少专门的 continuity 裁决，复述段直接落库。
- **POV 漂移**：prompt 仅有软性“第一人称沉浸”，缺少结构化约束与生成后裁决，导致叙事描述层出现“你看到/你伸手”等第二人称旁白。
- **性别代词错误**：canonical gender 虽存在（registry 权威身份卡），但未形成“packet 注入 + 生成后确定性纠错”闭环；模型会临场猜，尤其女性角色易被写成“他”。

---

### 2) 修改文件列表（本轮实际改动）
- **新增**
  - `src/lib/npcConsistency/narrativeGuardFlags.ts`
  - `src/lib/npcConsistency/narrativeContinuityValidator.ts`
  - `src/lib/npcConsistency/compositeNarrativeGuard.ts`
  - `src/lib/npcConsistency/compositeNarrativeGuard.test.ts`
- **复用并纳入统一裁决**
  - `src/lib/npcConsistency/povValidator.ts`
  - `src/lib/npcConsistency/genderPronounValidator.ts`
- **修改**
  - `src/lib/npcConsistency/validator.ts`（接入 composite guard + 统一 telemetry/log）

> 备注：packet/prompt 注入在前几阶段已落地（continuity_packet / pov_packet / npc_gender_pronoun_packet）。

---

### 3) 新增系统层（统一后置裁决层）
新增 `applyCompositeNarrativeGuard`，按顺序处理：
1. **continuity**：反复述、反解释腔、反聊天标签，必要时重写开头 1–2 句为“后果先行”的续写锚点。
2. **POV first-person**：叙事描述层禁“你…”，对白引号内允许“你”。
3. **gender pronoun**：基于 canonical identity 的窗口级纠错（围绕 npcName/npcId 的指代窗口），不做全局替换，不靠名字猜性别。

输出统一 telemetry：
- `continuityValidatorTriggered`
- `povValidatorTriggered`
- `genderValidatorTriggered`
- `rewriteTriggered`
- `rewriteReason`
- `finalNarrativeSafe`

---

### 4) 裁决顺序（为什么这样排）
- **先 continuity**：先把“解释腔/复述/聊天标签”清掉，避免后续 POV/gender 修复在“错误叙事形态”上做无效工作。
- **再 POV**：统一叙事主语为“我”，避免“你/我”混用。
- **最后 gender**：在叙事结构稳定后做局部代词纠错，误伤风险更低。

---

### 5) 灰度策略（feature flags）
新增开关（默认全开）：
- `VERSECRAFT_ENABLE_COMPOSITE_NARRATIVE_GUARD`
- `VERSECRAFT_ENABLE_CONTINUITY_GUARD`
- `VERSECRAFT_ENABLE_FIRST_PERSON_GUARD`
- `VERSECRAFT_ENABLE_GENDER_PRONOUN_GUARD`
- `VERSECRAFT_ENABLE_NARRATIVE_GUARD_DEBUG`

策略：
- **总开关**可一键回滚（避免线上紧急情况）。
- 子开关可定点回滚（例如只关 continuity，不影响 POV/gender）。
- debug 仅用于观测，不应默认开启。

---

### 6) 回滚策略
- 回滚顺序：先关 `COMPOSITE` 总开关 → 若仍需细调再逐项恢复。
- 所有裁决均为**后置文本层**（只改 `narrative`），不改变 JSON 契约与 SSE 形状，回滚风险低。

---

### 7) 验收标准（上线前/后）
- 叙事不再机械复述玩家输入、不出现“你刚才/你做了/系统判定…”解释腔。
- narrative 叙事描述层稳定第一人称“我”，对白引号内允许“你”。
- 灵伤/欣蓝/叶等女性角色不再被写成“他”；男性角色不被误改。
- 快车道/首轮/普通轮均适用，不破坏 JSON 契约。
- TTFT 与 token 成本增量可控：裁决层为纯本地字符串规则，不做二次模型调用。

---

### 8) Golden test 清单（6–10 条建议）
已新增基础 composite 回归（覆盖：continuity+POV+gender 顺序、男性不误修、解释腔触发重写）。

建议补齐至 6–10 条：
1. 玩家观察环境（短输入）→ 不解释腔，后果先行
2. 玩家与女性 NPC 对话（灵伤）→ “她”稳定，且对白可“你”
3. 玩家与高魅力 NPC 试探（欣蓝/北夏）→ 不误改性别、不二人称旁白
4. 玩家行动较长 → continuity 抑制复述开头
5. 首轮承接（opening）→ narrative 可短，但不出现“你…旁白”
6. 连续两回合承接（previous_tail_summary）→ 不另起开场

