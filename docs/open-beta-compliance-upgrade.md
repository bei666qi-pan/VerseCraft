# 公测合规升级说明（代码已实现部分）

## 原则

- **不是**「免责声明更长」，而是：可执行的受理路径、与产品能力对齐的表述、避免绝对化承诺。
- **不是**法律顾问结论；具体义务以运营、适用法律与专业意见为准（页脚 `LEGAL_SCOPE_BOUNDARY_FOOTNOTE`）。

## 已实现（代码 + 文档）

1. **服务端留痕受理**：`submitComplianceInquiry` → 表 `compliance_inquiries`，返回 `VC-COMP-*` 参考号。
2. **联系我们页**：在线提交为主路径；可选 `mailto` 副本；明示邮件不自动建工单。
3. **用户协议**：投诉/举报/申诉与在线提交、参考号、无完整工单后台等表述一致。
4. **隐私政策**：权利请求与受理渠道、数据库留痕说明与实现一致。
5. **数据处理专页**：`/legal/data-handling` 说明删除/导出/云端边界（与真实存储策略需运营定期核对）。
6. **公示信息**：域名、ICP 链接、`DEFAULT_BEIAN_NUMBER`、**默认公示电话**（`legalDefaults.DEFAULT_CONTACT_PHONE`，可被 `NEXT_PUBLIC_CONTACT_PHONE` 覆盖）。
7. **危险措辞**：主动否定「零风险」「绝对合法」「不承担任何责任」类不当承诺（见用户协议、AI 说明等）。

## 部署依赖

- 生产库须已执行含 `compliance_inquiries` 的迁移 / `ensureRuntimeSchema`（见 `docs/environment.md`、迁移脚本说明）。
- 建议在 Coolify 配置 `NEXT_PUBLIC_OPERATING_SUBJECT`、`NEXT_PUBLIC_CONTACT_EMAIL` 等与主体一致的信息。

## 详见

- `docs/legal-pages-upgrade.md`
- `docs/operations-followup-checklist.md`
