// src/app/sitemap.ts
//
// ISSUE-006：/sitemap.xml 之前 404。把站内可索引的公开入口汇总进来，
// 供搜索引擎与监控抓取。Next.js MetadataRoute.Sitemap 会自动产出
// /sitemap.xml（Content-Type: application/xml）。
//
// 范围与 src/app/robots.ts 的 allow 列表对齐：登录墙之后的内容由
// Next.js 的 not-found 兜底，不会被搜索索引到，所以这里只列公开页。

import type { MetadataRoute } from "next";
import { envBoolean } from "@/lib/config/envRaw";
import { isPreviewEnvironmentSignal } from "@/lib/config/previewGuards";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

const STATIC_PUBLIC_PATHS = [
  "/",
  "/intro",
  "/play",
  "/offline",
  "/leaderboard",
  "/legal",
  "/legal/user-agreement",
  "/legal/privacy-policy",
  "/legal/content-policy",
  "/legal/ai-disclaimer",
  "/legal/minors",
  "/legal/contact",
  "/legal/data-handling",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // 预览环境或显式 noindex 标志：返空（robots 也会一并 disallow）
  if (envBoolean("PREVIEW_SITE_NOINDEX", false) || isPreviewEnvironmentSignal()) {
    return [];
  }

  const cfg = getPublicRuntimeConfig();
  // 优先用合规配置里的官方站点入口（含协议），其次 NEXT_PUBLIC_APP_URL，
  // 最后兜底为 versecraft.cn 主域。
  const baseUrl =
    cfg.compliance.officialSiteUrl?.replace(/\/+$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "https://versecraft.cn";

  const now = new Date();
  return STATIC_PUBLIC_PATHS.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1.0 : path === "/play" || path === "/intro" ? 0.9 : 0.6,
  }));
}
