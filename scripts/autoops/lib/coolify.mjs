import { env, logJson, warnJson, writeRuntimeJson } from "./logger.mjs";

const SUCCESS_STATUS_RE = /(success|finished|completed|healthy|running)/i;
const FAILURE_STATUS_RE = /(fail|failed|error|cancel|exited|unhealthy)/i;

export function coolifyBaseCandidates(baseUrl = env("COOLIFY_BASE_URL")) {
  if (!baseUrl) {
    return [];
  }
  const clean = baseUrl.replace(/\/+$/g, "");
  if (/\/api\/v\d+$/i.test(clean)) {
    return [clean];
  }
  return [`${clean}/api/v1`, clean];
}

export class CoolifyClient {
  constructor({ baseUrl = env("COOLIFY_BASE_URL"), apiKey = env("COOLIFY_API_KEY"), dryRun = false, requestTimeoutMs = 15000 } = {}) {
    this.baseCandidates = coolifyBaseCandidates(baseUrl);
    this.apiKey = apiKey;
    this.dryRun = dryRun;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async request(path, { method = "GET", body = undefined, allow404 = false, timeoutMs = this.requestTimeoutMs } = {}) {
    if (!this.apiKey) {
      throw new Error("COOLIFY_API_KEY is required for Coolify API calls");
    }
    if (!this.baseCandidates.length) {
      throw new Error("COOLIFY_BASE_URL is required for Coolify API calls");
    }
    let lastError = null;
    for (const base of this.baseCandidates) {
      const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "VerseCraft-AutoOps",
          },
          body: body == null ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }
        }
        if (response.status === 404 && allow404) {
          return null;
        }
        if (!response.ok) {
          lastError = new Error(`Coolify ${method} ${path} failed at ${base}: ${response.status} ${text.slice(0, 400)}`);
          continue;
        }
        return data;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError || new Error(`Coolify ${method} ${path} failed`);
  }

  async health() {
    if (this.dryRun) {
      logJson("coolify.health.dry_run", { bases: this.baseCandidates });
      return { dryRun: true };
    }
    return this.request("/health", { allow404: true }).then((result) => result ?? this.request("/version"));
  }

  async resources() {
    if (this.dryRun) {
      logJson("coolify.resources.dry_run", { bases: this.baseCandidates });
      return [];
    }
    const result = await this.request("/resources");
    return Array.isArray(result) ? result : result?.data || result?.resources || [];
  }

  async deployments() {
    if (this.dryRun) {
      logJson("coolify.deployments.dry_run", {});
      return [];
    }
    const result = await this.request("/deployments");
    return Array.isArray(result) ? result : result?.data || result?.deployments || [];
  }

  async applicationDeployments(uuid) {
    if (!uuid) {
      return [];
    }
    if (this.dryRun) {
      logJson("coolify.application_deployments.dry_run", { uuid });
      return [];
    }
    const result = await this.request(`/applications/${encodeURIComponent(uuid)}/deployments`, { allow404: true });
    return Array.isArray(result) ? result : result?.data || result?.deployments || [];
  }

  async deployment(uuid) {
    if (this.dryRun) {
      logJson("coolify.deployment.dry_run", { uuid });
      return { deployment_uuid: uuid, status: "dry-run" };
    }
    return this.request(`/deployments/${encodeURIComponent(uuid)}`);
  }

  async deploy(uuid, { force = false, instant = false } = {}) {
    if (!uuid) {
      throw new Error("Coolify application UUID is required");
    }
    const query = new URLSearchParams({ uuid, force: String(Boolean(force)), instant_deploy: String(Boolean(instant)) });
    if (this.dryRun) {
      logJson("coolify.deploy.dry_run", { uuid, force, instant });
      return { dryRun: true, deployment_uuid: `dry-${Date.now()}` };
    }
    try {
      return await this.request(`/deploy?${query.toString()}`, { method: "GET" });
    } catch (error) {
      warnJson("coolify.deploy.get_failed_retry_post", { message: error.message });
      return this.request(`/deploy?${query.toString()}`, { method: "POST" });
    }
  }

  async restart(uuid) {
    if (!uuid) {
      throw new Error("Coolify application UUID is required");
    }
    if (this.dryRun) {
      logJson("coolify.restart.dry_run", { uuid });
      return { dryRun: true, deployment_uuid: `dry-restart-${Date.now()}` };
    }
    try {
      return await this.request(`/applications/${encodeURIComponent(uuid)}/restart`, { method: "GET" });
    } catch (error) {
      warnJson("coolify.restart.get_failed_retry_post", { message: error.message });
      return this.request(`/applications/${encodeURIComponent(uuid)}/restart`, { method: "POST" });
    }
  }

  async start(uuid) {
    if (!uuid) {
      throw new Error("Coolify application UUID is required");
    }
    if (this.dryRun) {
      logJson("coolify.start.dry_run", { uuid });
      return { dryRun: true, deployment_uuid: `dry-start-${Date.now()}` };
    }
    try {
      return await this.request(`/applications/${encodeURIComponent(uuid)}/start`, { method: "GET" });
    } catch (error) {
      warnJson("coolify.start.get_failed_retry_post", { message: error.message });
      return this.request(`/applications/${encodeURIComponent(uuid)}/start`, { method: "POST" });
    }
  }

  async pollDeployment(deploymentUuid, { attempts = 36, delayMs = 5000 } = {}) {
    if (!deploymentUuid) {
      return null;
    }
    let last = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      last = await this.deployment(deploymentUuid);
      const status = String(last?.status || last?.deployment?.status || "");
      logJson("coolify.deployment.poll", { deployment_uuid: deploymentUuid, attempt, status });
      await writeRuntimeJson("coolify-deployment.json", {
        deployment_uuid: deploymentUuid,
        attempt,
        status,
        response: last,
      });
      if (SUCCESS_STATUS_RE.test(status)) {
        return { ok: true, status, response: last };
      }
      if (FAILURE_STATUS_RE.test(status)) {
        return { ok: false, status, response: last };
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return { ok: false, status: "timeout", response: last };
  }
}

export function flattenCoolifyResources(resources) {
  const out = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      if (value.uuid || value.name || value.git_repository || value.fqdn) {
        out.push(value);
      }
      for (const item of Object.values(value)) {
        if (Array.isArray(item)) visit(item);
      }
    }
  };
  visit(resources);
  return out;
}

export function matchVerseCraftResource(resources) {
  const flat = flattenCoolifyResources(resources);
  const matches = flat.filter((resource) => {
    const text = [
      resource.name,
      resource.uuid,
      resource.git_repository,
      resource.repository,
      resource.fqdn,
      resource.domains,
      resource.description,
      resource.application_name,
    ]
      .flat()
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes("versecraft") || text.includes("bei666qi-pan/versecraft") || text.includes("versecraft.cn");
  });
  return { flat, matches };
}

export function scoreVerseCraftResource(resource) {
  const name = String(resource.name || resource.application_name || "").toLowerCase();
  const repo = String(resource.git_repository || resource.repository || "").toLowerCase();
  const fqdn = String(resource.fqdn || resource.domains || "").toLowerCase();
  const type = String(resource.type || "").toLowerCase();
  let score = 0;
  if (type === "application") score += 20;
  if (name === "versecraft") score += 80;
  if (name.includes("versecraft")) score += 20;
  if (repo.includes("versecraft")) score += 20;
  if (fqdn.split(",").map((item) => item.trim()).includes("https://versecraft.cn")) score += 90;
  if (fqdn.includes("www.versecraft.cn")) score += 15;
  if (name.includes("preview") || fqdn.includes("preview.versecraft.cn")) score -= 80;
  if (name.includes("relay") || fqdn.includes("relay.versecraft.cn")) score -= 80;
  if (type.includes("postgres") || type.includes("redis")) score -= 120;
  return score;
}

export async function discoverCoolifyAppUuid({ dryRun = false } = {}) {
  const existing = env("COOLIFY_APP_UUID");
  if (existing) {
    return { uuid: existing, source: "env", confidence: "high" };
  }
  const client = new CoolifyClient({ dryRun });
  const resources = await client.resources();
  const { matches } = matchVerseCraftResource(resources);
  const ranked = matches
    .map((item) => ({ ...item, autoops_score: scoreVerseCraftResource(item) }))
    .sort((a, b) => b.autoops_score - a.autoops_score);
  const report = {
    discovered_at: new Date().toISOString(),
    match_count: matches.length,
    matches: ranked.map((item) => ({
      uuid: item.uuid,
      name: item.name || item.application_name,
      git_repository: item.git_repository || item.repository,
      fqdn: item.fqdn,
      type: item.type,
      score: item.autoops_score,
    })),
  };
  await writeRuntimeJson("coolify-discovery.json", report);
  if (ranked.length >= 1 && ranked[0].uuid && ranked[0].autoops_score >= 100) {
    const secondScore = ranked[1]?.autoops_score ?? -Infinity;
    if (ranked[0].autoops_score - secondScore >= 40) {
      return { uuid: ranked[0].uuid, source: "coolify", confidence: "high", report };
    }
  }
  return { uuid: "", source: "coolify", confidence: "low", report };
}
