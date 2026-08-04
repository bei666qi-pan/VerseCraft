import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  BrowserPlaythroughDecision,
  BrowserPlaythroughDecisionProvider,
  BrowserPlaythroughObservation,
} from "./browserPlaythrough";

export const CODEX_HANDOFF_PROTOCOL_VERSION = 1;
export const DEFAULT_CODEX_HANDOFF_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_CODEX_HANDOFF_POLL_INTERVAL_MS = 300;
export type CodexPlaytestMode = "developer" | "blind";

export interface CodexHandoffRequest {
  protocolVersion: number;
  runId: string;
  turnIndex: number;
  ticket: string;
  createdAt: string;
  mode: CodexPlaytestMode;
  observation: BrowserPlaythroughObservation;
  instructions: string;
}

export interface CodexHandoffDecision extends BrowserPlaythroughDecision {
  protocolVersion: number;
  runId: string;
  turnIndex: number;
  ticket: string;
  decidedAt: string;
}

export interface CodexFileHandoffOptions {
  runId: string;
  artifactDir: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  mode?: CodexPlaytestMode;
}

export interface CodexFileHandoff {
  handoffDir: string;
  requestPath: string;
  decisionPath: string;
  decisionProvider: BrowserPlaythroughDecisionProvider;
}

export interface SubmitCodexHandoffDecisionInput {
  action?: string;
  intent?: string;
  stop?: boolean;
}

function handoffDirForRun(artifactDir: string, runId: string): string {
  return join(artifactDir, `${runId}.codex-handoff`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Codex handoff ${name} must be a non-empty string`);
  return value;
}

function readInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`Codex handoff ${name} must be an integer`);
  return value;
}

function readMode(value: unknown): CodexPlaytestMode {
  if (value === "developer" || value === "blind") return value;
  throw new Error(`Codex handoff mode must be developer or blind, received ${String(value)}`);
}

export async function writeJsonAtomically(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

export async function readCodexHandoffRequest(requestPath: string): Promise<CodexHandoffRequest> {
  const raw = JSON.parse(await readFile(requestPath, "utf8")) as unknown;
  if (!isRecord(raw)) throw new Error("Codex handoff request must be an object");
  if (raw.protocolVersion !== CODEX_HANDOFF_PROTOCOL_VERSION) {
    throw new Error(`unsupported Codex handoff protocol: ${String(raw.protocolVersion)}`);
  }
  if (!isRecord(raw.observation)) throw new Error("Codex handoff request observation must be an object");

  return {
    protocolVersion: CODEX_HANDOFF_PROTOCOL_VERSION,
    runId: readString(raw.runId, "runId"),
    turnIndex: readInteger(raw.turnIndex, "turnIndex"),
    ticket: readString(raw.ticket, "ticket"),
    createdAt: readString(raw.createdAt, "createdAt"),
    mode: readMode(raw.mode),
    observation: raw.observation as unknown as BrowserPlaythroughObservation,
    instructions: readString(raw.instructions, "instructions"),
  };
}

function parseCodexHandoffDecision(raw: unknown): CodexHandoffDecision | null {
  if (!isRecord(raw) || raw.protocolVersion !== CODEX_HANDOFF_PROTOCOL_VERSION) return null;
  if (typeof raw.runId !== "string" || typeof raw.turnIndex !== "number" || typeof raw.ticket !== "string") return null;
  if (typeof raw.action !== "string" || typeof raw.intent !== "string" || typeof raw.stop !== "boolean") return null;
  if (typeof raw.decidedAt !== "string") return null;

  return {
    protocolVersion: CODEX_HANDOFF_PROTOCOL_VERSION,
    runId: raw.runId,
    turnIndex: raw.turnIndex,
    ticket: raw.ticket,
    action: raw.action,
    intent: raw.intent,
    stop: raw.stop,
    decidedAt: raw.decidedAt,
  };
}

async function readDecisionIfPresent(decisionPath: string): Promise<CodexHandoffDecision | null> {
  try {
    return parseCodexHandoffDecision(JSON.parse(await readFile(decisionPath, "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

function matchesRequest(decision: CodexHandoffDecision, request: CodexHandoffRequest): boolean {
  return (
    decision.protocolVersion === request.protocolVersion &&
    decision.runId === request.runId &&
    decision.turnIndex === request.turnIndex &&
    decision.ticket === request.ticket
  );
}

export function decisionPathForRequest(requestPath: string): string {
  return join(dirname(requestPath), "decision.json");
}

export async function submitCodexHandoffDecision(
  requestPath: string,
  input: SubmitCodexHandoffDecisionInput
): Promise<{ decisionPath: string; decision: CodexHandoffDecision }> {
  const request = await readCodexHandoffRequest(requestPath);
  const stop = input.stop === true;
  const action = input.action?.trim() ?? "";
  const intent = input.intent?.trim() || (stop ? "codex_stopped_playtest" : "codex_player_action");
  if (!stop && !action) throw new Error("Codex decision requires --action unless --stop is supplied");

  const decision: CodexHandoffDecision = {
    protocolVersion: CODEX_HANDOFF_PROTOCOL_VERSION,
    runId: request.runId,
    turnIndex: request.turnIndex,
    ticket: request.ticket,
    action,
    intent,
    stop,
    decidedAt: new Date().toISOString(),
  };
  const decisionPath = decisionPathForRequest(requestPath);
  await writeJsonAtomically(decisionPath, decision);
  return { decisionPath, decision };
}

export function createCodexFileHandoff(options: CodexFileHandoffOptions): CodexFileHandoff {
  const handoffDir = handoffDirForRun(options.artifactDir, options.runId);
  const requestPath = join(handoffDir, "request.json");
  const decisionPath = join(handoffDir, "decision.json");
  const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_HANDOFF_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_CODEX_HANDOFF_POLL_INTERVAL_MS;
  const mode = options.mode ?? "developer";

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Codex handoff timeout must be positive");
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new Error("Codex handoff poll interval must be positive");
  if (mode !== "developer" && mode !== "blind") throw new Error(`unsupported Codex playtest mode: ${String(mode)}`);

  return {
    handoffDir,
    requestPath,
    decisionPath,
    decisionProvider: {
      decide: async (observation) => {
        await mkdir(handoffDir, { recursive: true });
        await rm(decisionPath, { force: true });
        const request: CodexHandoffRequest = {
          protocolVersion: CODEX_HANDOFF_PROTOCOL_VERSION,
          runId: options.runId,
          turnIndex: observation.turnIndex,
          ticket: randomUUID(),
          createdAt: new Date().toISOString(),
          mode,
          observation,
          instructions:
            mode === "developer"
              ? "你是开发者模式玩家，而非 DM。只依据 observation 决定行动；你可结合仓库主动尝试游戏内允许的边界与异常操作来发现产品问题。不要把 store、prompt、系统消息或 API 内部数据当作玩家事实。输出短 intent，不输出思维链。"
              : "你是盲测玩家，而非 DM。只依据 observation 做出下一步自然语言行动；不要要求或使用 store、IndexedDB、prompt、系统消息、API 内部数据、调试信息或任何此前剧情之外的信息。输出短 intent，不输出思维链。",
        };
        await writeJsonAtomically(requestPath, request);

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const decision = await readDecisionIfPresent(decisionPath);
          if (decision && matchesRequest(decision, request)) {
            if (!decision.stop && !decision.action.trim()) {
              throw new Error(`Codex decision for turn ${observation.turnIndex} has no action`);
            }
            return { action: decision.action, intent: decision.intent, stop: decision.stop };
          }
          await sleep(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
        }

        throw new Error(
          `Codex handoff timed out for run ${options.runId} turn ${observation.turnIndex}; waiting request: ${requestPath}`
        );
      },
    },
  };
}
