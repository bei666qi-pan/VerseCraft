import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(base) & mask);
}

export function isRestrictedIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) {
    return [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
      ["224.0.0.0", 4], ["240.0.0.0", 4],
    ].some(([base, bits]) => inV4Range(normalized, String(base), Number(bits)));
  }
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") || normalized.startsWith("2001:db8") ||
      normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

export function assertResolvedAddressesSafe(
  addresses: readonly { address: string }[],
  opts?: { allowLocalhost?: boolean }
): void {
  if (addresses.length === 0) throw new Error("service_url_dns_empty");
  if (opts?.allowLocalhost !== true && addresses.some((row) => isRestrictedIp(row.address))) {
    throw new Error("service_url_restricted");
  }
}

export function parseManagedServiceUrl(raw: string, opts?: { allowLocalhost?: boolean }): URL {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("service_url_invalid"); }
  const allowLocal = opts?.allowLocalhost === true;
  if (url.username || url.password) throw new Error("service_url_credentials_forbidden");
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) throw new Error("service_url_https_required");
  if (!url.hostname || url.hostname.endsWith(".local") || url.hostname === "metadata.google.internal") throw new Error("service_url_restricted");
  if (isIP(url.hostname) && isRestrictedIp(url.hostname) && !allowLocal) throw new Error("service_url_restricted");
  url.hash = "";
  return url;
}

export async function assertManagedServiceUrlSafe(raw: string, opts?: { allowLocalhost?: boolean }): Promise<URL> {
  return (await resolveManagedServiceUrlSafe(raw, opts)).url;
}

export async function resolveManagedServiceUrlSafe(raw: string, opts?: { allowLocalhost?: boolean }): Promise<{
  url: URL;
  addresses: Array<{ address: string; family: number }>;
}> {
  const url = parseManagedServiceUrl(raw, opts);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  assertResolvedAddressesSafe(addresses, opts);
  return { url, addresses };
}

export function completionEndpoint(baseUrl: string, transport?: "openai_compatible" | "openai_responses" | "ark_multimodal" | "mock"): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (transport === "openai_responses") {
    if (/\/responses$/i.test(normalized)) return normalized;
    return `${normalized}/responses`;
  }
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

export function embeddingEndpoint(
  baseUrl: string,
  transport: "openai_compatible" | "openai_responses" | "ark_multimodal" | "mock",
): string {
  if (transport === "ark_multimodal") return `${baseUrl.replace(/\/+$/, "")}/api/v3/embeddings/multimodal`;
  const normalized = baseUrl.replace(/\/+$/, "");
  if (/\/embeddings$/i.test(normalized)) return normalized;
  if (/\/chat\/completions$/i.test(normalized)) return normalized.replace(/\/chat\/completions$/i, "/embeddings");
  if (/\/responses$/i.test(normalized)) return normalized.replace(/\/responses$/i, "/embeddings");
  // Volcengine Ark agent-plan exposes `/api/plan/v3/embeddings` directly
  // (no `/v1` prefix). Detect that base path so we don't append a stray
  // `/v1/embeddings` segment.
  if (/\/api\/plan\/v3$/i.test(normalized)) return `${normalized}/embeddings`;
  if (/\/v1$/i.test(normalized)) return `${normalized}/embeddings`;
  return `${normalized}/v1/embeddings`;
}
