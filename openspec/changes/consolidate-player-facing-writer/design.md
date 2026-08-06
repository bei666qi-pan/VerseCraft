# Design: consolidate-player-facing-writer

## Architecture

```
PLAYER_CHAT (task)
  → taskPolicy resolves primaryRole = "writer"
  → envCore resolves AI_MODEL_WRITER → model name
  → if AI_MODEL_WRITER not set → fallback AI_MODEL_MAIN
  → generateWriterTurn() → generateMainReply() → executePlayerChatStream()
```

## Role Boundaries

### Writer
- PLAYER_CHAT 玩家可见正文
- 已裁决 mechanics 结果的文学呈现
- 基于 director hints 生成自然叙事

### Writer DOES NOT
- 意图分类和风险 lane (control)
- 安全政策裁决
- 领域规则计算 (domain services)
- 提交 StateDelta 或写 FINAL
- 后台世界推演 (reasoner)

### Preserved
- `control`: 低延迟控制面，失败快速 fail-open
- `reasoner`: WORLDBUILD, STORYLINE_SIMULATION, critic, eval 等离线任务
- `enhance`: 主笔流后可选场景增强（门控 + 预算）

## Backward Compatibility

- `AI_MODEL_WRITER` not set → `AI_MODEL_MAIN` used
- `AI_MODEL_MAIN` not deleted
- Old `main` role chain in `AI_PLAYER_ROLE_CHAIN` still resolves
- admin/debug 路由可区分 canonical role vs legacy alias
- analytics 保持旧口径（writer 映射为 main）

## Feature Flag

None needed — Writer is the canonical name for the existing behavior.
