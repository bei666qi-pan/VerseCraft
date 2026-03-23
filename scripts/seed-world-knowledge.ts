import { ensureRuntimeSchema } from "@/db/ensureSchema";
import { seedFromRegistry } from "@/lib/worldKnowledge/bootstrap/seedFromRegistry";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      stage: "world-knowledge-seed:start",
      dryRun,
    })
  );

  await ensureRuntimeSchema();
  const result = await seedFromRegistry({ dryRun });

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      stage: "world-knowledge-seed:done",
      ...result,
    })
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      stage: "world-knowledge-seed:error",
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
});
