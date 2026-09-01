// src/app/legal/page.tsx
//
// ISSUE-007：让 /legal 父路由生效。当前 src/app/legal/index/page.tsx 只响应
// /legal/index，/legal 落到 not-found。把同一组件作为 /legal 的默认页
// （与 Next.js app router 的 index 行为对齐），保持 /legal/index 仍然可达。
//
// 不动 src/app/legal/index/page.tsx，避免破坏 src/app/legal/legalPagesExist.test.ts
// 对 index/page.tsx 文件路径的依赖；test 关心的是文件存在而不是 URL 形状。

import LegalIndexPage from "./index/page";

export const metadata = {
  title: "法律中心 - VerseCraft versecraft.cn",
  description:
    "VerseCraft 用户协议、隐私政策、内容规范、AI 说明与联系入口（versecraft.cn）。",
};

export default function LegalPage() {
  return <LegalIndexPage />;
}
