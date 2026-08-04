# INTEGRITY_RULES — 测试完整性红线

> 基于 LOOP-CONTRACT.md §4 + clean-test-integrity 审计发现 + 当前代码现实

## 禁止行为（自动检测规则）

### 规则 1：禁止存根断言
```typescript
// ❌ 禁止
assert.ok(true);
assert.equal(1, 1);

// ✅ 要求
assert.ok(Array.isArray(result));
assert.equal(result.status, "ok");
```

**检测方法：** `grep -rn "assert.ok(true)\|assert.equal(1,\s*1)" src/`

### 规则 2：禁止永久 skip
```typescript
// ❌ 禁止
test.skip(true, "never runs");
test.skip();

// ✅ 允许（条件 skip）
test.skip(!process.env.E2E_AI_LIVE, "requires live gateway");
```

**检测方法：** `grep -rn "test.skip(true)\|\.skip()" e2e/`

### 规则 3：禁止吞错后返回成功
```typescript
// ❌ 禁止
try { await riskyOp(); } catch { /* ignore */ }
return { ok: true };

// ✅ 要求
try { await riskyOp(); } catch (e) {
  return { ok: false, error: String(e), mode: "degraded" };
}
```

### 规则 4：禁止 fallback 到满分
```javascript
// ❌ 禁止
if (!result.ok) return { passRate: 1, total: 28, pass: 28 };

// ✅ 要求
if (!result.ok) return { passRate: 0, total: 0, pass: 0, notRun: true };
```

**检测方法：** `grep -rn "passRate.*:\s*1" scripts/`

### 规则 5：禁止 Mock 自证
- Mock 叙事不得根据 eval 关键词注入内容
- Mock eval 分数必须标注 `confidence: "offline_heuristic"`
- Mock 通过不得描述为"真实 AI 质量通过"

### 规则 6：禁止未经校准的 AI Judge 作硬门
- AI Judge 作发布门必须 Spearman >= 0.7（对 gold set）
- 未校准 judge 只能用于信号检测，不能用于通过/失败判定
- 离线启发式评分只能检测结构性缺陷

### 规则 7：禁止通过修改测试让失败用例通过
- 可以修 buggy 的测试断言，但必须提供：
  - 原断言与真实 contract 冲突的证据
  - 新断言为何更准确
  - 至少一个能证明新测试不是恒真的负例

### 规则 8：禁止使用 `|| true` 或 fallback 及格
- 禁止 `someCheck() || true`
- 禁止 `passRate: fallbackValue ?? 1`
- 禁止 `score = result.score || 5`

## 当前代码违规检查结果

| 规则 | 检查结果 | 状态 |
|------|----------|------|
| R1: 存根断言 | `assert.ok(true)` 未发现 | ✅ 通过 |
| R2: 永久 skip | `test.skip(true)` 未发现 | ✅ 通过 |
| R3: 吞错返回成功 | 需逐个审查 catch 块 | ⚠️ 待验证 |
| R4: fallback 满分 | benchmark-run.mjs 已排除不可用测试 | ✅ 通过 |
| R5: Mock 自证 | 设计时耦合仍存在（注释残留） | ⚠️ 部分风险 |
| R6: 未校准 judge | calibration.ts 存在但未接线 | ❌ 未满足 |
| R7: 修改测试让通过 | 无法自动检测 | ⚠️ 需人工审查 |
| R8: `\|\| true` | 需扫描 | ⚠️ 待验证 |

## 同一 AI 测试自己代码的偏差缓解

### 必须执行的审查步骤

当 AI 从 dev 模式切换到 test 模式时：

1. **暂停实现思维** — 停止继续修改生产代码
2. **重读验收标准** — 从需求和 contract 重新推导预期
3. **把 diff 当作第三方提交** — 假设所有改动都可能有 bug
4. **先找失败路径** — 不从 happy path 开始验证
5. **覆盖反例+边界+恢复** — 至少各一个
6. **UI 黑盒约束** — 不通过读 store/API 内部状态冒充用户
7. **检查测试本身的真实性** — 测试是否真的执行并断言

### 可自动化的检查

```bash
# 检查测试是否真的断言了
grep -c "assert\." src/**/*.test.ts | grep ":0$"

# 检查是否有未等待的异步
grep -rn "await.*assert\|fire.and.forget" src/**/*.test.ts

# 检查 eval 分数是否都有置信度标注
grep -rn "confidence\|offline_heuristic\|live_model" src/lib/evals/
```

## CI 集成建议

在 CI 中增加完整性检查 job：

```yaml
test-integrity:
  runs-on: ubuntu-latest
  steps:
    - name: Check no assert.ok(true)
      run: '! grep -rn "assert\.ok(true)" src/ e2e/ || exit 1'
    - name: Check no permanent skip
      run: '! grep -rn "test\.skip(true)" e2e/ || exit 1'
    - name: Check no fallback passRate:1
      run: '! grep -rn "passRate.*:\s*1" scripts/ || exit 1'
```
