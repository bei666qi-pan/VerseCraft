#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readOption(args, name) {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function readRepeatedOption(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index] ?? "";
    if (value.startsWith(`${name}=`)) values.push(value.slice(name.length + 1));
    else if (value === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

export function getPathValue(source, dottedPath) {
  return dottedPath.split(".").filter(Boolean).reduce((current, segment) => {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    return current[segment];
  }, source);
}

export function assertEvalReport(report, rules) {
  const failures = [];

  for (const dottedPath of rules.requireTrue) {
    const actual = getPathValue(report, dottedPath);
    if (actual !== true) failures.push(`${dottedPath}: expected true, got ${JSON.stringify(actual)}`);
  }

  for (const rule of rules.requireEqual) {
    const separator = rule.indexOf("=");
    if (separator <= 0) {
      failures.push(`invalid --require-equal rule: ${rule}`);
      continue;
    }
    const dottedPath = rule.slice(0, separator);
    const expectedRaw = rule.slice(separator + 1);
    const actual = getPathValue(report, dottedPath);
    const expected = expectedRaw === "true" ? true
      : expectedRaw === "false" ? false
        : expectedRaw === "null" ? null
          : expectedRaw;
    if (actual !== expected) failures.push(`${dottedPath}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  const file = readOption(args, "--file");
  if (!file) {
    console.error("Usage: node scripts/assert-eval-report.mjs --file <report.json> [--require-true path] [--require-equal path=value]");
    process.exit(2);
  }

  const absolutePath = path.resolve(file);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Eval report does not exist: ${absolutePath}`);
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    console.error(`Eval report is not valid JSON: ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const failures = assertEvalReport(report, {
    requireTrue: readRepeatedOption(args, "--require-true"),
    requireEqual: readRepeatedOption(args, "--require-equal"),
  });

  if (failures.length > 0) {
    console.error(`Eval hard gate failed for ${absolutePath}:`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Eval hard gate passed: ${absolutePath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main();
