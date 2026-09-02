// src/app/sitemap.test.ts
//
// ISSUE-006 回归：保证 /sitemap.xml 不再 404，并且输出包含核心公开页。
// 注意 robots.ts 在 PREVIEW 模式下会 disallow，但 sitemap 只在生产
// 真正生效；这里用 envBoolean(...,false) 同款判定走 default 分支。

import test from "node:test";
import assert from "node:assert/strict";
import sitemap from "./sitemap";

test("sitemap returns at least the core public pages", () => {
  const entries = sitemap();
  assert.ok(Array.isArray(entries), "expected an array");
  assert.ok(entries.length >= 10, `expected >=10 entries, got ${entries.length}`);
  const urls = new Set(entries.map((e) => new URL(e.url).pathname));
  for (const path of [
    "/",
    "/play",
    "/leaderboard",
    "/legal",
    "/legal/user-agreement",
    "/legal/privacy-policy",
  ]) {
    assert.ok(urls.has(path), `sitemap missing ${path}, has ${[...urls].join(",")}`);
  }
});

test("sitemap entries are absolute https URLs and have lastModified", () => {
  const entries = sitemap();
  for (const e of entries) {
    const u = new URL(e.url);
    assert.equal(u.protocol, "https:", `bad protocol for ${e.url}`);
    assert.ok(e.lastModified instanceof Date, `missing lastModified for ${e.url}`);
  }
});
