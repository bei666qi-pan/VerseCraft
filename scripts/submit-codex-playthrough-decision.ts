import { submitCodexHandoffDecision } from "../e2e/support/codexFileHandoff";

function readOption(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const requestPath = readOption(args, "--request");
  if (!requestPath) throw new Error("Usage: pnpm codex:playthrough:decide -- --request <request.json> --action <行动> --intent <意图> [--stop]");

  const result = await submitCodexHandoffDecision(requestPath, {
    action: readOption(args, "--action"),
    intent: readOption(args, "--intent"),
    stop: args.includes("--stop"),
  });
  console.log(`Codex decision written: ${result.decisionPath}`);
  console.log(`run=${result.decision.runId} turn=${result.decision.turnIndex} stop=${result.decision.stop}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
