import "server-only";

import { jsonrepair } from "jsonrepair";
import { pool } from "@/db/index";
import { runOfflineReasonerTask } from "@/lib/ai/logicalTasks";
import { embedText, toPgVectorLiteral } from "./embed";
import { enqueueJob } from "./jobs";
import { normalizeForHash, sha256Hex } from "./normalize";

export type JanitorAction = "discard" | "demote_private" | "enter_consensus";

export type JanitorAiOutput = {
  compliance_ok: boolean;
  violations: unknown[];
  significance_score: number;
  canonical_text: string;
  normalized_text: string;
  action: JanitorAction;
  tags: unknown[];
};

function parseJanitorJson(raw: string): JanitorAiOutput | null {
  let text = raw.trim();
  try {
    text = jsonrepair(text);
  } catch {
    /* 仍尝试 parse */
  }
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const action = o.action;
    if (action !== "discard" && action !== "demote_private" && action !== "enter_consensus") return null;
    const compliance_ok = Boolean(o.compliance_ok);
    const significance_score = Number(o.significance_score);
    if (!Number.isFinite(significance_score) || significance_score < 1 || significance_score > 10) return null;
    const canonical_text = typeof o.canonical_text === "string" ? o.canonical_text.trim() : "";
    const normalized_text = typeof o.normalized_text === "string" ? o.normalized_text.trim() : "";
    if (!canonical_text) return null;
    return {
      compliance_ok,
      violations: Array.isArray(o.violations) ? o.violations : [],
      significance_score: Math.trunc(significance_score),
      canonical_text,
      normalized_text: normalized_text || normalizeForHash(canonical_text),
      action,
      tags: Array.isArray(o.tags) ? o.tags : [],
    };
  } catch {
    return null;
  }
}

function janitorSystemPrompt(): string {
  const schema = {
    compliance_ok: true,
    violations: [] as string[],
    significance_score: 9,
    canonical_text: "规范化后的世界设定陈述（中文）",
    normalized_text: "用于聚类的关键词空格分隔",
    action: "enter_consensus|discard|demote_private",
    tags: ["地点", "特产"],
  };
  return [
    "你是 VerseCraft 世界观 Janitor（离线审核员）。",
    "硬规则：不得输出色情、仇恨、现实敏感政治、违法内容；不得破坏 TRPG 安全边界。",
    "若违反硬规则：compliance_ok=false，action 必须为 discard。",
    "significance_score 为 1-10 整数，表示对主线的潜在影响。",
    "action=demote_private：内容只适合作为玩家私有笔记，不宜进入公共共识。",
    "action=enter_consensus：合规且可作为公共设定候选进入共识管道。",
    "action=discard：拒绝采纳，保留审计。",
    "请严格以 JSON 格式输出。",
    `输出必须匹配结构示意：${JSON.stringify(schema)}`,
  ].join("\n");
}

/**
 * 审核单条 vc_world_candidate；失败时抛错由 worker 重试。
 */
export async function runJanitorForCandidate(args: { candidateId: number; requestId: string }): Promise<void> {
  const client = await pool.connect();
  let row: {
    id: string;
    body: string;
    proposer_user_id: string | null;
    janitor_status: string | null;
  } | null = null;
  try {
    const sel = await client.query<{
      id: string;
      body: string;
      proposer_user_id: string | null;
      janitor_status: string | null;
    }>(
      `SELECT id, body, proposer_user_id, janitor_status FROM vc_world_candidate WHERE id = $1 LIMIT 1`,
      [String(args.candidateId)]
    );
    row = sel.rows[0] ?? null;
  } finally {
    client.release();
  }

  if (!row) {
    throw new Error("candidate_not_found");
  }
  if (row.janitor_status === "done") {
    return;
  }

  const upd = await pool.connect();
  try {
    await upd.query(
      `UPDATE vc_world_candidate SET janitor_status = 'running', updated_at = NOW() WHERE id = $1 AND janitor_status <> 'done'`,
      [String(args.candidateId)]
    );
  } finally {
    upd.release();
  }

  const userContent = [
    `candidate_id=${args.candidateId}`,
    `proposer_user_id=${row.proposer_user_id ?? "null"}`,
    "原始候选正文：",
    row.body.slice(0, 12_000),
  ].join("\n");

  const ai = await runOfflineReasonerTask({
    kind: "worldbuild",
    messages: [
      { role: "system", content: janitorSystemPrompt() },
      { role: "user", content: userContent },
    ],
    ctx: {
      requestId: args.requestId,
      userId: row.proposer_user_id,
      sessionId: "kg_janitor",
      path: "/lib/kg/janitor",
    },
    skipCache: true,
    devOverrides: { responseFormatJsonObject: true },
  });

  if (!ai.ok) {
    throw new Error(`janitor_ai_failed:${ai.code ?? "unknown"}`);
  }

  const parsed = parseJanitorJson(String(ai.content ?? ""));
  if (!parsed) {
    throw new Error("janitor_json_parse_failed");
  }

  const vec = embedText(parsed.canonical_text);
  const vecLit = toPgVectorLiteral(vec);
  const meta = { logicalRole: ai.logicalRole };

  const w = await pool.connect();
  try {
    await w.query("BEGIN");
    await w.query(
      `UPDATE vc_world_candidate SET
        janitor_status = 'done',
        compliance_ok = $2,
        significance_score = $3,
        janitor_action = $4,
        canonical_text = $5,
        normalized_text = $6,
        janitor_violations = $7::jsonb,
        janitor_tags = $8::jsonb,
        janitor_model_meta = $9::jsonb,
        embedding = $10::vector,
        updated_at = NOW()
      WHERE id = $1`,
      [
        String(args.candidateId),
        parsed.compliance_ok,
        parsed.significance_score,
        parsed.action,
        parsed.canonical_text,
        parsed.normalized_text,
        JSON.stringify(parsed.violations),
        JSON.stringify(parsed.tags),
        JSON.stringify(meta),
        vecLit,
      ]
    );

    if (parsed.action === "demote_private" && row.proposer_user_id) {
      await w.query(`INSERT INTO vc_user_fact (user_id, fact_text) VALUES ($1, $2)`, [
        row.proposer_user_id,
        parsed.canonical_text.slice(0, 8000),
      ]);
    }

    await w.query("COMMIT");
  } catch (e) {
    try {
      await w.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const err = await pool.connect();
    try {
      await err.query(
        `UPDATE vc_world_candidate SET janitor_status = 'error', updated_at = NOW() WHERE id = $1`,
        [String(args.candidateId)]
      );
    } finally {
      err.release();
    }
    throw e;
  } finally {
    w.release();
  }

  if (parsed.action === "enter_consensus" && parsed.compliance_ok) {
    await enqueueJob("CONSENSUS_ONE", { candidateId: args.candidateId }, { priority: 5 });
  }
}

