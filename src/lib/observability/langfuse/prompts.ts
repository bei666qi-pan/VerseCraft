// src/lib/observability/langfuse/prompts.ts
// Langfuse Prompt Management adapter.
// Supports three modes: local (default), shadow (async compare), remote (cached fetch).
import "server-only";

import { getLangfuseConfig, isLangfuseReady } from "./config";
import { hashContent } from "./privacy";

export interface PromptFetchResult {
  /** The prompt text to use. */
  text: string;
  /** Where the prompt came from. */
  source: "local" | "remote" | "local_fallback";
  /** Langfuse prompt name. */
  name: string;
  /** Langfuse prompt version (if remote). */
  version?: number;
  /** Langfuse prompt label (if remote). */
  label?: string;
  /** Hash of the prompt text for comparison. */
  hash: string;
}

/**
 * Fetch a prompt from Langfuse (or use the local fallback).
 *
 * Modes:
 * - "local": Returns the `localText` immediately. Never calls Langfuse.
 * - "shadow": Returns `localText` immediately. Fires a background fetch from
 *   Langfuse and logs the hash comparison (no blocking).
 * - "remote": Fetches from Langfuse with a timeout. Falls back to `localText`
 *   on any error or timeout.
 *
 * @param name — Langfuse prompt name
 * @param localText — the locally-defined prompt text (always available)
 * @param options.label — Langfuse label to fetch (default: "production")
 * @param options.timeoutMs — timeout for remote fetch (default: 2000ms)
 */
export async function fetchPrompt(
  name: string,
  localText: string,
  options: { label?: string; timeoutMs?: number } = {}
): Promise<PromptFetchResult> {
  const cfg = getLangfuseConfig();
  const label = options.label ?? "production";
  const timeoutMs = options.timeoutMs ?? 2000;

  const localResult: PromptFetchResult = {
    text: localText,
    source: "local",
    name,
    hash: hashContent(localText),
  };

  // Local mode: never fetch
  if (cfg.promptSource === "local") {
    return localResult;
  }

  // Shadow mode: return local, fetch in background
  if (cfg.promptSource === "shadow") {
    void fetchPromptRemote(name, label, timeoutMs).then((remote) => {
      if (remote) {
        const remoteHash = hashContent(remote.text);
        if (remoteHash !== localResult.hash) {
          console.info("[langfuse] prompt shadow comparison", {
            name,
            localHash: localResult.hash,
            remoteHash,
            remoteVersion: remote.version,
          });
        }
      }
    });
    return localResult;
  }

  // Remote mode: fetch with fallback
  if (cfg.promptSource === "remote") {
    try {
      const remote = await fetchPromptRemote(name, label, timeoutMs);
      if (remote) {
        return {
          text: remote.text,
          source: "remote",
          name,
          version: remote.version,
          label,
          hash: hashContent(remote.text),
        };
      }
    } catch {
      console.warn("[langfuse] prompt fetch failed, using local fallback", { name });
    }
    return { ...localResult, source: "local_fallback" };
  }

  return localResult;
}

/**
 * Actually fetch a prompt from Langfuse via the @langfuse/client package.
 */
async function fetchPromptRemote(
  name: string,
  label: string,
  timeoutMs: number
): Promise<{ text: string; version?: number } | null> {
  if (!isLangfuseReady()) return null;

  try {
    // Dynamic import — @langfuse/client is ESM-only
    const { LangfuseClient } = await import("@langfuse/client");
    const cfg = getLangfuseConfig();

    const client = new LangfuseClient({
      publicKey: cfg.publicKey!,
      secretKey: cfg.secretKey!,
      baseUrl: cfg.baseUrl,
    });

    const prompt = await Promise.race([
      client.prompt.get(name, { label, type: "text" }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("langfuse_prompt_timeout")), timeoutMs);
      }),
    ]);

    return {
      text: prompt.prompt as string,
      version: prompt.version,
    };
  } catch (err) {
    // Langfuse fetch failure is non-fatal
    console.warn("[langfuse] prompt fetch error", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Check if a prompt exists in Langfuse and log comparison.
 * For CI/pre-deploy validation: verifies the local prompt matches what's in Langfuse.
 */
export async function validatePromptShadow(
  name: string,
  localText: string,
  label = "production"
): Promise<{ match: boolean; localHash: string; remoteHash?: string; remoteVersion?: number }> {
  const localHash = hashContent(localText);

  try {
    const remote = await fetchPromptRemote(name, label, 5000);
    if (!remote) {
      return { match: false, localHash };
    }
    const remoteHash = hashContent(remote.text);
    return {
      match: localHash === remoteHash,
      localHash,
      remoteHash,
      remoteVersion: remote.version,
    };
  } catch {
    return { match: false, localHash };
  }
}
