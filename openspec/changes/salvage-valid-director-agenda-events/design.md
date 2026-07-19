## Context

World Director 计划有两类硬失败：计划自身的 schema / 总体风险 / 私有钩子违规，以及单个 agenda event 缺字段、剧透或强制后果。现行实现把二者都转成 `accepted=false`，worker 因此完全不写 agenda；真实 probe 证明这会让一条坏 event 吞掉两条合规环境提示。

## Goals / Non-Goals

**Goals:**

- 计划级 hard failure 仍阻断所有 agenda。
- event-level hard failure 只阻断该 event，其他独立合规 event 可被持久化和消费。
- 继续把拒绝代码写入现有 validation telemetry。

**Non-Goals:**

- 不为不合格事件自动补写高风险 agency/forbidden 字段。
- 不改变 Director 的模型调用、worker 异步性、queue schema 或线上 `/api/chat` 首包。

## Decisions

### 1. 显式区分 plan-level 与 item-level failure

schema、整体 risk assessment 和私有 hook contract 是 plan-level；它们设置 `accepted=false` 并清空所有 accepted codes。每个 agenda/social event 的字段和内容校验是 item-level；失败仅进入相应 rejected code，成功项继续进入 accepted code。

备选的全计划拒绝虽简单但已证明确实造成导演无效。备选的自动默认高优先级事件则会把模型遗漏包装成安全输入，拒绝。

### 2. worker 以 accepted codes 决定写入

现有 worker 已有 `acceptedEventCodes` 和 `agenda_write_allowed`；调整 `accepted` 含义后可无 schema 迁移地只写安全项。统计仍保留完整 issue list，便于观察模型质量。

## Risks / Trade-offs

- [遗漏 plan-level 漏洞分类] → 把 private hook loop 移到 plan-level 决策之前，添加全局风险回归。
- [高风险 event 被错误保留] → 每个 event 仍必须独立通过原有 hard validator，不改变规则。
- [社会事件语义不一致] → 对 social events 使用同样的 item-only rejection；global social risk 仍全拒。

## Migration Plan

1. 改 validator 与混合计划单元测试。
2. 重跑真实 director probe，要求至少一个 agenda 持久化并由 runtime consumer 读取。
3. 如回归，只需恢复 validator 的全局拒绝语义；无需数据迁移。
