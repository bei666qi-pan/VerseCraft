# 法律页面升级说明

## 页面清单（App Router）

| 路径 | 用途 |
|------|------|
| `/legal/index` | 法律中心索引 + 备案/域名/电话摘要 |
| `/legal/user-agreement` | 用户协议 |
| `/legal/privacy-policy` | 隐私政策 |
| `/legal/content-policy` | 内容规范 |
| `/legal/ai-disclaimer` | AI 生成说明 |
| `/legal/minors` | 未成年人说明 |
| `/legal/contact` | 联系、举报、数据请求（`ContactPageClient`） |
| `/legal/data-handling` | 数据处理与权利请求产品边界 |

## 壳组件

- `LegalDocShell`：统一展示产品名、生效日期、运营主体（若配置）、官网、ICP、**联系电话**。
- 页脚统一注入 `LEGAL_SCOPE_BOUNDARY_FOOTNOTE`（`legalDefaults.ts`）。

## 配置来源

- `getPublicRuntimeConfig().compliance`：`NEXT_PUBLIC_*` + `legalDefaults` 默认值（备案、域名、默认电话等）。

## 本轮相对「基础展示」的增量

- 在线表单 → 服务端写入 → 参考号回显；协议章节与隐私政策描述该路径。
- 用户协议明确：**无**完整工单后台、**不承诺**固定完成时点，与真实能力一致。
- 联系电话在壳、联系我们、法律中心、用户协议联系条款、合规页脚中贯通。

## 占位与夸大 — 维护时自检

- 搜索「后续再」「待补充」「TODO」等（允许「后续正式运营」类正常表述，但避免「以后再写真实内容」式空话）。
- 禁止新增「100% 合规」「零风险」「绝对无法律问题」等表述。
