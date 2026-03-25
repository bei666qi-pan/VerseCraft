import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** 合规相关路由应对应存在的 page 文件（回归：勿删入口）。 */
const LEGAL_PAGE_FILES = [
  "user-agreement/page.tsx",
  "privacy-policy/page.tsx",
  "content-policy/page.tsx",
  "ai-disclaimer/page.tsx",
  "minors/page.tsx",
  "contact/page.tsx",
  "data-handling/page.tsx",
  "index/page.tsx",
] as const;

test("legal section page files exist", () => {
  const base = join(process.cwd(), "src", "app", "legal");
  for (const rel of LEGAL_PAGE_FILES) {
    assert.ok(existsSync(join(base, rel)), `missing ${rel}`);
  }
});
