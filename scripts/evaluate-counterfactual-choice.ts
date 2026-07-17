#!/usr/bin/env tsx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assessCounterfactualChoice, type CounterfactualRun } from "../src/lib/evals/productQuality/counterfactualChoice";

const args = process.argv.slice(2);
const value = (name: string): string => {
  const index = args.indexOf(name);
  const found = index >= 0 ? args[index + 1] : null;
  if (!found) throw new Error(`missing ${name}`);
  return resolve(found);
};

async function main(): Promise<void> {
  const aPath = value("--a");
  const bPath = value("--b");
  const outPath = value("--out");
  const [a, b] = await Promise.all([
    readFile(aPath, "utf8").then((text) => JSON.parse(text) as CounterfactualRun),
    readFile(bPath, "utf8").then((text) => JSON.parse(text) as CounterfactualRun),
  ]);
  const assessment = assessCounterfactualChoice(a, b);
  const artifact = { generatedAt: new Date().toISOString(), inputs: { a: aPath, b: bPath }, assessment };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(artifact, null, 2), "utf8");
  console.log(JSON.stringify(artifact, null, 2));
  if (!assessment.meaningfulChoice) process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
