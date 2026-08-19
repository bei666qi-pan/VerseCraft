import { existsSync, lstatSync, readdirSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface EvalArtifactManifest {
  version: number;
  include: string[];
  preserve: string[];
}

function assertSafePattern(pattern: string): void {
  if (!pattern || isAbsolute(pattern) || pattern.split(/[\\/]/).includes("..")) {
    throw new Error(`不安全的 manifest 路径: ${pattern}`);
  }
}

function globRegex(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

function staticRoot(pattern: string): string {
  const wildcardIndex = pattern.search(/[?*]/);
  const prefix = wildcardIndex < 0 ? pattern : pattern.slice(0, wildcardIndex);
  const slashIndex = prefix.lastIndexOf("/");
  return slashIndex < 0 ? "." : prefix.slice(0, slashIndex) || ".";
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stat = lstatSync(root);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) files.push(...walkFiles(join(root, entry)));
  return files;
}

function assertContained(repoRoot: string, absolutePath: string): void {
  const rel = relative(repoRoot, absolutePath);
  if (!rel || rel === "." || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error(`产物路径越出仓库或指向仓库根: ${absolutePath}`);
  }
}

export function listEvalArtifacts(repoRoot: string, manifest: EvalArtifactManifest): string[] {
  if (manifest.version !== 1) throw new Error(`不支持的 manifest 版本: ${manifest.version}`);
  for (const pattern of [...manifest.include, ...manifest.preserve]) assertSafePattern(pattern);
  const root = resolve(repoRoot);
  const includes = manifest.include.map(globRegex);
  const preserves = manifest.preserve.map(globRegex);
  const candidates = new Set<string>();
  for (const pattern of manifest.include) {
    const scanRoot = resolve(root, staticRoot(pattern));
    assertContained(root, scanRoot === root ? resolve(root, pattern) : scanRoot);
    for (const file of walkFiles(scanRoot)) candidates.add(file);
  }
  return [...candidates]
    .map((absolutePath) => {
      assertContained(root, absolutePath);
      return relative(root, absolutePath).split(sep).join("/");
    })
    .filter((path) => includes.some((matcher) => matcher.test(path)))
    .filter((path) => !preserves.some((matcher) => matcher.test(path)))
    .sort();
}

export function cleanupEvalArtifacts(args: {
  repoRoot: string;
  manifest: EvalArtifactManifest;
  deleteFiles: boolean;
  terminalSuccess: boolean;
}): { candidates: string[]; deleted: string[] } {
  const candidates = listEvalArtifacts(args.repoRoot, args.manifest);
  if (args.deleteFiles && !args.terminalSuccess) {
    throw new Error("拒绝删除：必须同时提供 --delete --terminal-success，并确认 deterministic、live smoke、deep/holdout 终轮全部成功");
  }
  if (!args.deleteFiles) return { candidates, deleted: [] };
  const root = resolve(args.repoRoot);
  for (const path of candidates) unlinkSync(resolve(root, path));
  return { candidates, deleted: candidates };
}
