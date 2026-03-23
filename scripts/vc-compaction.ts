/**
 * 周归档：冷事实移出热池。可挂 cron：pnpm kg:compact
 */
async function main(): Promise<void> {
  const { loadVerseCraftEnvFilesOnce } = await import("../src/lib/config/loadVerseCraftEnv");
  loadVerseCraftEnvFilesOnce();

  const { pool } = await import("../src/db/index");
  const { runWeeklyFactCompaction } = await import("../src/lib/kg/compaction");

  const n = await runWeeklyFactCompaction();
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: "vc_compaction", rowsUpdated: n }));
  await pool.end().catch(() => {});
}

main().catch((e) => {
  console.error(JSON.stringify({ level: "fatal", msg: String(e instanceof Error ? e.message : e) }));
  process.exitCode = 1;
});
