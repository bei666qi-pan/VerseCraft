import { env, logJson, warnJson, writeRuntimeJson } from "./logger.mjs";

export function isSuccessfulDeploymentStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();
  return ["success", "successful", "finished", "completed", "running:healthy"].includes(status);
}

export function isFailedDeploymentStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();
  return (
    status === "error" ||
    status === "exited" ||
    status === "unhealthy" ||
    status === "running:unhealthy" ||
    status.startsWith("fail") ||
    status.startsWith("cancel")
  );
}

export function normalizeDeploymentList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.deployments)) return result.deployments;
  if (Array.isArray(result?.data?.deployments)) return result.data.deployments;
  return [];
}

export function deploymentStatus(deployment) {
  return String(deployment?.status || deployment?.deployment?.status || "").trim();
}

function normalizeApplicationEnvList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.envs)) return result.envs;
  return [];
}

export function planApplicationEnvMutation(result, key, value) {
  const exists = normalizeApplicationEnvList(result).some(
    (entry) => String(entry?.key || entry?.name || "") === key,
  );
  return {
    method: exists ? "PATCH" : "POST",
    body: {
      key,
      value,
      is_preview: false,
      // Coolify's public API spells this field without an underscore.
      // Sending `is_build_time` is rejected with 422 and the base-URL
      // fallback used to obscure that response as a later 404.
      is_buildtime: false,
      is_literal: true,
    },
  };
}

function deploymentCreatedAt(deployment) {
  const value = Date.parse(String(deployment?.created_at || deployment?.updated_at || ""));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Coolify releases have returned a non-queryable UUID on some installations.
 * Prefer the reported UUID, then select the newest deployment created for the
 * same application after ignoring the snapshot captured before triggering.
 */
export function selectTriggeredDeployment(
  deployments,
  { expectedUuid = "", applicationName = "", knownDeploymentIds = new Set() } = {}
) {
  const list = normalizeDeploymentList(deployments);
  if (expectedUuid) {
    const exact = list.find((item) => String(item?.deployment_uuid || item?.uuid || "") === expectedUuid);
    if (exact) return exact;
  }
  const normalizedName = String(applicationName).trim().toLowerCase();
  if (!normalizedName) return null;
  const known = knownDeploymentIds instanceof Set ? knownDeploymentIds : new Set(knownDeploymentIds || []);
  return list
    .filter((item) => {
      const id = String(item?.deployment_uuid || item?.uuid || "");
      return (
        id.length > 0 &&
        !known.has(id) &&
        String(item?.application_name || "").trim().toLowerCase() === normalizedName
      );
    })
    .sort((a, b) => deploymentCreatedAt(b) - deploymentCreatedAt(a))[0] || null;
}

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
  constructor({ baseUrl = env("COOLIFY_BASE_URL"), apiKey = env("COOLIFY_API_KEY"), dryRun = false, requestTimeoutMs = 15000, retryDelayMs = 1000 } = {}) {
    this.baseCandidates = coolifyBaseCandidates(baseUrl);
    this.apiKey = apiKey;
    this.dryRun = dryRun;
    this.requestTimeoutMs = requestTimeoutMs;
    this.retryDelayMs = retryDelayMs;
  }

  async request(path, { method = "GET", body = undefined, allow404 = false, timeoutMs = this.requestTimeoutMs } = {}) {
    if (!this.apiKey) {
      throw new Error("COOLIFY_API_KEY is required for Coolify API calls");
    }
    if (!this.baseCandidates.length) {
      throw new Error("COOLIFY_BASE_URL is required for Coolify API calls");
    }
    let lastError = null;
    const retryableMethod = method === "GET" || method === "PATCH" || method === "PUT";
    const maxAttempts = retryableMethod ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let transientFailure = false;
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
            transientFailure ||= response.status === 429 || response.status >= 500;
            continue;
          }
          // A base URL without the API suffix can return the Coolify SPA with
          // HTTP 200. Treat that HTML as a failed candidate so the next API base
          // is tried instead of later interpreting it as an empty deployment.
          if (/^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text)) {
            lastError = new Error(`Coolify ${method} ${path} returned HTML at ${base}`);
            continue;
          }
          return data;
        } catch (error) {
          lastError = error;
          transientFailure = true;
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!transientFailure || attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
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
    return normalizeDeploymentList(await this.request("/deployments"));
  }

  async application(uuid) {
    if (!uuid) return null;
    if (this.dryRun) return { uuid, name: "dry-run", status: "running:healthy" };
    return this.request(`/applications/${encodeURIComponent(uuid)}`);
  }

  async upsertApplicationEnv(uuid, key, value) {
    if (!uuid || !key || !value) {
      throw new Error("Coolify application UUID, environment key, and non-empty value are required");
    }
    if (this.dryRun) return { updated: false, dryRun: true, key };
    const path = `/applications/${encodeURIComponent(uuid)}/envs`;
    const current = await this.request(path);
    const mutation = planApplicationEnvMutation(current, key, value);
    await this.request(path, { method: mutation.method, body: mutation.body });
    return { updated: true, method: mutation.method, key };
  }

  async deploymentSnapshot(applicationUuid) {
    const [application, deployments] = await Promise.all([
      this.application(applicationUuid).catch(() => null),
      this.deployments(),
    ]);
    return {
      applicationName: String(application?.name || application?.application_name || ""),
      applicationUpdatedAt: String(application?.last_online_at || application?.updated_at || ""),
      knownDeploymentIds: new Set(
        deployments.map((item) => String(item?.deployment_uuid || item?.uuid || "")).filter(Boolean)
      ),
    };
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
    const query = new URLSearchParams({ uuid });
    if (force) {
      query.set("force", "true");
    }
    if (instant) {
      query.set("instant_deploy", "true");
    }
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

  async pollDeployment(
    deploymentUuid,
    {
      attempts = 36,
      delayMs = 5000,
      applicationUuid = "",
      knownDeploymentIds = new Set(),
      applicationName = "",
      applicationUpdatedAt = "",
    } = {}
  ) {
    if (!deploymentUuid) {
      return null;
    }
    let last = null;
    let observed = false;
    let observedUuid = deploymentUuid;
    let resolvedApplicationName = applicationName;
    if (!resolvedApplicationName && applicationUuid) {
      try {
        const application = await this.application(applicationUuid);
        resolvedApplicationName = String(application?.name || application?.application_name || "");
      } catch {
        // Collection fallback remains safe even if application metadata is temporarily unavailable.
      }
    }
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      // 轮询窗口常常长达 10-20 分钟：本机到 Coolify 的网络瞬时抖动（DNS/连接超时等）
      // 不代表远端部署本身出了问题——真实遇到过一次 fetch 失败直接抛出把整个自愈脚本
      // 崩掉，而 Coolify 侧的构建其实还在正常继续。这里把单次查询失败当作"这一轮没查到"，
      // 等下一轮重试，而不是让异常穿透到调用方。
      try {
        last = await this.deployment(observedUuid);
      } catch (error) {
        warnJson("coolify.deployment.poll_error", {
          deployment_uuid: observedUuid,
          attempt,
          message: error instanceof Error ? error.message : String(error),
        });
        last = null;
      }

      let status = deploymentStatus(last);
      if (!status) {
        try {
          const candidate = selectTriggeredDeployment(await this.deployments(), {
            expectedUuid: deploymentUuid,
            applicationName: resolvedApplicationName,
            knownDeploymentIds,
          });
          if (candidate) {
            last = candidate;
            observed = true;
            observedUuid = String(candidate.deployment_uuid || candidate.uuid || observedUuid);
            status = deploymentStatus(candidate);
            logJson("coolify.deployment.resolved_from_collection", {
              expected_deployment_uuid: deploymentUuid,
              deployment_uuid: observedUuid,
              attempt,
              status,
            });
          }
        } catch (error) {
          warnJson("coolify.deployment.collection_poll_error", {
            deployment_uuid: deploymentUuid,
            attempt,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        observed = true;
      }

      if (!status && observed && applicationUuid) {
        try {
          const application = await this.application(applicationUuid);
          const applicationStatus = deploymentStatus(application);
          const currentApplicationUpdatedAt = String(application?.last_online_at || application?.updated_at || "");
          if (
            isSuccessfulDeploymentStatus(applicationStatus) &&
            applicationUpdatedAt &&
            currentApplicationUpdatedAt &&
            currentApplicationUpdatedAt !== applicationUpdatedAt
          ) {
            return { ok: true, status: applicationStatus, response: application, deploymentUuid: observedUuid };
          }
        } catch {
          // Preserve the bounded observation window when the application endpoint is transiently unavailable.
        }
      }

      logJson("coolify.deployment.poll", { deployment_uuid: observedUuid, attempt, status });
      await writeRuntimeJson("coolify-deployment.json", {
        deployment_uuid: observedUuid,
        expected_deployment_uuid: deploymentUuid,
        attempt,
        status,
        response: last,
      });
      if (isFailedDeploymentStatus(status)) {
        return { ok: false, status, response: last, deploymentUuid: observedUuid };
      }
      if (isSuccessfulDeploymentStatus(status)) {
        return { ok: true, status, response: last, deploymentUuid: observedUuid };
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
