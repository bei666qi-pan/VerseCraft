import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import pg from "pg";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

type BoolMap = Record<string, boolean>;

function toBoolMap(keys: string[], present: Set<string>): BoolMap {
  return keys.reduce<BoolMap>((acc, key) => {
    acc[key] = present.has(key);
    return acc;
  }, {});
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.replace(/^['"]|['"]$/g, "").trim();
  if (!url) {
    throw new Error("DATABASE_URL is missing");
  }
  const { Client } = pg;
  const client = new Client({ connectionString: url });
  const tables = [
    "vc_world_meta",
    "vc_world_fact",
    "vc_world_candidate",
    "vc_world_cluster",
    "vc_cluster_observation",
    "vc_semantic_cache",
    "vc_jobs",
  ];
  const ivfflatIndexes = [
    "vc_semantic_cache_ivfflat_global_codex",
    "vc_world_cluster_ivfflat_centroid",
    "vc_world_fact_ivfflat_hot",
  ];

  try {
    await client.connect();
    const ext = await client.query(
      "select exists(select 1 from pg_extension where extname='vector') as ok"
    );
    const tableRows = await client.query(
      "select tablename from pg_tables where schemaname='public' and tablename = any($1::text[])",
      [tables]
    );
    const idxRows = await client.query(
      "select indexname, indexdef from pg_indexes where schemaname='public' and indexname = any($1::text[])",
      [ivfflatIndexes]
    );
    const idxPresent = new Set(
      idxRows.rows
        .filter((r) => String(r.indexdef ?? "").toLowerCase().includes("ivfflat"))
        .map((r) => String(r.indexname))
    );
    const adviceConcurrency = 1;
    const rawConc = process.env.VC_WORKER_CONCURRENCY;
    const configuredConcurrency = rawConc ? Number(rawConc) : 1;
    const result = {
      vector_extension: Boolean(ext.rows?.[0]?.ok),
      tables_present: toBoolMap(
        tables,
        new Set(tableRows.rows.map((r) => String(r.tablename)))
      ),
      ivfflat_indexes_present: toBoolMap(ivfflatIndexes, idxPresent),
      worker: {
        recommended_concurrency_4c8g: adviceConcurrency,
        configured: Number.isFinite(configuredConcurrency) ? configuredConcurrency : 1,
      },
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(
    JSON.stringify(
      {
        error: e instanceof Error ? e.message : String(e),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});

