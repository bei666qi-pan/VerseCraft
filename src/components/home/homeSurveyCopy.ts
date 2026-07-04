/**
 * 首页问卷弹窗文案。
 * 独立成小模块的原因：HomeClient 需要引用 SURVEY_COPY.noLink，
 * 若直接从 HomeSurveyModal 值导入，会把整个弹窗组件拉进首页主 bundle，
 * 导致 next/dynamic 无法真正拆分 chunk。
 */
export const SURVEY_COPY = {
  entryLabel: "产品问卷",
  title: "产品问卷",
  subtitle: "用于迭代节奏、界面与引导分层，帮助我们判断下一版优先级。",
  estimate: "约 2 分钟，以选择题为主；末尾可留一句话。提交后立即入库，无需跳转外链。",
  later: "稍后再说",
  submitEmbedded: "提交问卷",
  externalBackup: "备用：外链问卷",
  surveyDoneLine: "该设备／账号下本问卷已归档，感谢你的时间。",
  feedbackSecondary: "问题反馈（开放文本）",
  feedbackBack: "返回问卷",
  privacyHint: "提交即表示你已阅读《隐私政策》，我们仅将内容用于产品与体验分析。",
  noLink: "暂未配置外链问卷；请使用上方站内表单。",
  syncHint: "正在向服务器核对是否已提交…",
} as const;
