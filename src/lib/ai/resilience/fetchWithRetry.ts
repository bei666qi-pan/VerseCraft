// src/lib/ai/resilience/fetchWithRetry.ts
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 408;
}

export interface ResilientFetchOptions {
  timeoutMs: number;
  maxRetries: number;
  parentSignal?: AbortSignal;
  isRetryable?: (response: Response | null, error: unknown) => boolean;
}

/**
 * Bounded timeout + retry for upstream LLM HTTP calls. Retries only when retryable (network / 429 / 503…).
 */
export async function resilientFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions
): Promise<Response> {
  const { timeoutMs, maxRetries, parentSignal } = options;
  const isRetryable =
    options.isRetryable ??
    ((res, err) => {
      if (err) {
        if (isAbortError(err)) return false;
        return true;
      }
      if (!res) return true;
      return isRetryableHttpStatus(res.status);
    });

  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signals: AbortSignal[] = [timeoutController.signal];
    if (parentSignal) signals.push(parentSignal);
    const combined =
      typeof AbortSignal !== "undefined" && "any" in AbortSignal
        ? AbortSignal.any(signals)
        : timeoutController.signal;

    try {
      lastResponse = await fetch(url, { ...init, signal: combined });
      clearTimeout(timeoutId);
      if (!isRetryable(lastResponse, null)) {
        return lastResponse;
      }
      if (attempt < maxRetries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      return lastResponse;
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e;
      if (!isRetryable(null, e)) {
        throw e;
      }
      if (attempt < maxRetries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw e;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("resilientFetch: empty result");
}
