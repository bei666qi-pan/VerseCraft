import { createHash } from "node:crypto";
import type {
  ContentSafetyProvider,
  ModerationDecision,
  ModerationEvidence,
  ModerationRequest,
  ModerationResult,
  ModerationRiskLevel,
} from "@/lib/safety/types";
import type { BaiduSinanConfig } from "@/lib/safety/baidu/env";
import { createSingleFlightTokenCache } from "@/lib/safety/tokenCache";
import { fetchBaiduAccessToken, type FetchLike, BaiduTokenError } from "@/lib/safety/baidu/tokenClient";
import { callBaiduTextCensor, BaiduCensorError, type BaiduTextCensorRawResponse } from "@/lib/safety/baidu/textCensorClient";
import type { BaiduCensorErrorKind } from "@/lib/safety/baidu/textCensorClient";

function computeFingerprint(args: { salt: string; text: string }): string {
  const salt = args.salt ?? "";
  const h = createHash("sha256");
  h.update(salt);
  h.update("\n");
  h.update(args.text);
  return h.digest("hex");
}

function riskFromDecision(decision: ModerationDecision): ModerationRiskLevel {
  if (decision === "allow") return "normal";
  if (decision === "review") return "gray";
  return "black";
}

function uniq(arr: string[]): string[] {
  const s = new Set<string>();
  for (const x of arr) {
    if (x) s.add(x);
  }
  return [...s];
}

type BaiduHit = {
  type?: number;
  subType?: number;
  conclusion?: string;
  conclusionType?: number;
  msg?: string;
  probability?: number;
  datasetName?: string;
};

function extractHits(raw: BaiduTextCensorRawResponse | null | undefined): BaiduHit[] {
  const out: BaiduHit[] = [];
  const data = raw?.data;
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const j = item as Record<string, unknown>;
    const probabilityFromItem = typeof j.probability === "number" ? j.probability : undefined;
    const conclusionType = typeof j.conclusionType === "number" ? j.conclusionType : Number(j.conclusionType);

    // hits is an array; we keep at most first entry fields for compact evidence.
    let hitsProbability: number | undefined;
    let hitsDataset: string | undefined;
    const hitsArr = Array.isArray(j.hits) ? j.hits : [];
    if (hitsArr.length > 0) {
      const h0 = hitsArr[0] as Record<string, unknown>;
      const p = typeof h0?.probability === "number" ? h0.probability : Number(h0?.probability);
      if (Number.isFinite(p) && p > 0) hitsProbability = p;
      if (typeof h0?.datasetName === "string") hitsDataset = h0.datasetName;
    }
    const probability = probabilityFromItem ?? hitsProbability;

    out.push({
      type: typeof j.type === "number" ? j.type : Number(j.type),
      subType: typeof j.subType === "number" ? j.subType : Number(j.subType),
      conclusion: typeof j.conclusion === "string" ? j.conclusion : undefined,
      conclusionType: Number.isFinite(conclusionType) ? conclusionType : undefined,
      msg: typeof j.msg === "string" ? j.msg : undefined,
      probability: probability && Number.isFinite(probability) ? probability : undefined,
      datasetName: hitsDataset,
    });
  }
  return out;
}

function categoriesFromHits(hits: BaiduHit[]): string[] {
  const cats: string[] = [];
  for (const h of hits) {
    const msg = h.msg ?? "";
    if (/色情|性/.test(msg)) cats.push("sexual");
    else if (/暴恐|恐怖/.test(msg)) cats.push("violence_extreme");
    else if (/政治/.test(msg)) cats.push("political");
    else if (/联系方式|电话|邮箱|微信|QQ|网址/.test(msg)) cats.push("privacy");
    else if (/诈骗|欺诈|传销|集资|洗钱/.test(msg)) cats.push("scam");
    else cats.push("baidu_type_" + String(h.type ?? "na"));
  }
  return uniq(cats);
}

function scoreFromConclusion(conclusionType: number | undefined, hits: BaiduHit[]): number | undefined {
  const ct = typeof conclusionType === "number" ? conclusionType : undefined;
  if (ct == null) return undefined;
  if (hits.length === 0) {
    if (ct === 1) return 0;
    if (ct === 2) return 95;
    if (ct === 3) return 70;
    if (ct === 4) return 50;
    return undefined;
  }

  const maxProb = Math.max(
    0,
    ...hits
      .map((h) => (typeof h.probability === "number" && Number.isFinite(h.probability) ? h.probability : 0))
  );
  // Probability seems to be 0..1 in examples; convert to 0..100.
  if (maxProb > 0) return Math.round(maxProb * 100);

  if (ct === 2) return 95;
  if (ct === 3) return 70;
  if (ct === 4) return 50;
  if (ct === 1) return 0;
  return undefined;
}

export type BaiduSinanTextProviderDeps = {
  fetchImpl?: FetchLike;
};

export class BaiduSinanTextProvider implements ContentSafetyProvider {
  readonly name = "baidu_text_censor";

  private cfg: BaiduSinanConfig;
  private fetchImpl?: FetchLike;
  private tokenCache: ReturnType<typeof createSingleFlightTokenCache>;

  constructor(cfg: BaiduSinanConfig, deps?: BaiduSinanTextProviderDeps) {
    this.cfg = cfg;
    this.fetchImpl = deps?.fetchImpl;
    this.tokenCache = createSingleFlightTokenCache(
      async () => {
        return fetchBaiduAccessToken({
          cfg: {
            apiKey: this.cfg.apiKey,
            secretKey: this.cfg.secretKey,
            authMode: this.cfg.authMode,
            tokenUrl: this.cfg.tokenUrl,
            timeoutMs: this.cfg.timeoutMs,
            connectTimeoutMs: this.cfg.connectTimeoutMs,
          },
          fetchImpl: this.fetchImpl,
        }).catch((e) => {
          // Let error propagate; tokenCache only handles single-flight.
          throw e;
        });
      },
      {
        key: "baidu_sinan_access_token",
        refreshWindowMs: 60_000,
      }
    );
  }

  private failModeForStage(stage: ModerationRequest["stage"]): "fail_soft" | "fail_closed" {
    return stage === "public" ? this.cfg.failModePublic : this.cfg.failModePrivate;
  }

  private shouldFailClosed(stage: ModerationRequest["stage"]): boolean {
    return this.failModeForStage(stage) === "fail_closed";
  }

  async moderateText(req: ModerationRequest): Promise<ModerationResult> {
    const fingerprint = computeFingerprint({ salt: this.cfg.hashSalt, text: req.text });
    const evidenceBase: ModerationEvidence = {
      provider: this.name,
      contentFingerprint: fingerprint,
      traceId: req.traceId,
    };

    // Hard fail if missing credentials.
    if (!this.cfg.apiKey || !this.cfg.secretKey) {
      const decision: ModerationDecision = this.shouldFailClosed(req.stage) ? "block" : "allow";
      return {
        decision,
        riskLevel: riskFromDecision(decision),
        categories: ["baidu_auth_missing"],
        score: decision === "allow" ? 35 : 90,
        reasonCode: "baidu_auth_missing",
        evidence: {
          ...evidenceBase,
          vendor: { authMode: this.cfg.authMode, enabled: this.cfg.enabled },
          errorKind: "auth_error",
          errorMessage: "missing_api_key_or_secret_key",
        },
      };
    }

    let accessToken: string;
    try {
      accessToken = await this.tokenCache.getToken();
    } catch (e) {
      const kind = e instanceof BaiduTokenError ? e.kind : "unknown_error";
      const isFailClosed = this.shouldFailClosed(req.stage);
      const decision: ModerationDecision = isFailClosed ? "block" : "allow";
      return {
        decision,
        riskLevel: riskFromDecision(decision),
        categories: ["baidu_auth_error"],
        score: decision === "allow" ? 35 : 90,
        reasonCode: "baidu_auth_error",
        evidence: {
          ...evidenceBase,
          vendor: { authMode: this.cfg.authMode },
          errorKind: kind,
          errorMessage: e instanceof Error ? e.message : String(e),
        },
      };
    }

    // Call censor endpoint.
    let raw: BaiduTextCensorRawResponse | null = null;
    try {
      raw = await callBaiduTextCensor({
        cfg: {
          textCensorUrl: this.cfg.textCensorUrl,
          timeoutMs: this.cfg.timeoutMs,
          connectTimeoutMs: this.cfg.connectTimeoutMs,
          strictnessProfile: this.cfg.strictnessProfile,
        },
        accessToken,
        text: req.text,
        userId: req.userIdHash,
        fetchImpl: this.fetchImpl,
      });
    } catch (e) {
      const kind: BaiduCensorErrorKind = e instanceof BaiduCensorError ? e.kind : "unknown_error";
      const isFailClosed = this.shouldFailClosed(req.stage);
      const decision: ModerationDecision = isFailClosed ? "block" : "allow";

      return {
        decision,
        riskLevel: riskFromDecision(decision),
        categories: ["baidu_censor_error"],
        score: decision === "allow" ? 35 : 90,
        reasonCode: "baidu_censor_error",
        evidence: {
          ...evidenceBase,
          vendor: {},
          errorKind: kind,
          errorMessage: e instanceof Error ? e.message : String(e),
        },
      };
    }

    const conclusionType = typeof raw?.conclusionType === "number" ? raw.conclusionType : Number(raw?.conclusionType);
    const hits = extractHits(raw);
    const categories = categoriesFromHits(hits);
    const score = scoreFromConclusion(conclusionType, hits);

    if (!Number.isFinite(conclusionType)) {
      const isFailClosed = this.shouldFailClosed(req.stage);
      const decision: ModerationDecision = isFailClosed ? "block" : "allow";
      return {
        decision,
        riskLevel: riskFromDecision(decision),
        categories: ["baidu_response_structure_error"],
        score: decision === "allow" ? 35 : 90,
        reasonCode: "baidu_response_structure_error",
        evidence: {
          ...evidenceBase,
          vendor: { conclusionType: raw?.conclusionType, conclusion: raw?.conclusion },
          errorKind: "response_structure_error",
          errorMessage: "missing_conclusionType",
        },
      };
    }

    if (conclusionType === 1) {
      return {
        decision: "allow",
        riskLevel: "normal",
        categories: ["none"],
        score: 0,
        reasonCode: "baidu_conclusion_allow",
        evidence: {
          ...evidenceBase,
          vendor: {
            conclusionType,
            conclusion: raw?.conclusion,
            log_id: raw?.log_id,
            hits: this.cfg.logRawText ? hits : hits.map((h) => ({ type: h.type, subType: h.subType, msg: h.msg, probability: h.probability, datasetName: h.datasetName })),
          },
        },
      };
    }

    if (conclusionType === 2) {
      return {
        decision: "block",
        riskLevel: "black",
        categories: categories.length > 0 ? categories : ["baidu_non_compliant"],
        score: score ?? 95,
        reasonCode: "baidu_conclusion_non_compliant",
        evidence: {
          ...evidenceBase,
          vendor: {
            conclusionType,
            conclusion: raw?.conclusion,
            log_id: raw?.log_id,
            hits: this.cfg.logRawText ? hits : hits.map((h) => ({ type: h.type, subType: h.subType, msg: h.msg, probability: h.probability, datasetName: h.datasetName })),
          },
        },
      };
    }

    if (conclusionType === 3) {
      return {
        decision: "review",
        riskLevel: "gray",
        categories: categories.length > 0 ? categories : ["baidu_suspected"],
        score: score ?? 70,
        reasonCode: "baidu_conclusion_suspected",
        evidence: {
          ...evidenceBase,
          vendor: {
            conclusionType,
            conclusion: raw?.conclusion,
            log_id: raw?.log_id,
            hits: this.cfg.logRawText ? hits : hits.map((h) => ({ type: h.type, subType: h.subType, msg: h.msg, probability: h.probability, datasetName: h.datasetName })),
          },
        },
      };
    }

    // conclusionType === 4 (审核失败)
    {
      const isFailClosed = this.shouldFailClosed(req.stage);
      const decision: ModerationDecision = isFailClosed ? "block" : "allow";
      return {
        decision,
        riskLevel: riskFromDecision(decision),
        categories: ["baidu_audit_failed"],
        score: decision === "allow" ? 35 : 90,
        reasonCode: isFailClosed ? "baidu_audit_failed_fail_closed" : "baidu_audit_failed_fail_soft",
        evidence: {
          ...evidenceBase,
          vendor: { conclusionType, conclusion: raw?.conclusion, log_id: raw?.log_id, error_msg: raw?.error_msg },
          errorKind: "service_error",
          errorMessage: raw?.error_msg ? String(raw.error_msg) : "baidu_audit_failed",
        },
      };
    }
  }
}

