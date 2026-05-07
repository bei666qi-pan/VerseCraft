import crypto from "node:crypto";
import { env, logJson, redact, writeRuntimeJson } from "./logger.mjs";

const VOLC_ENDPOINT = "https://open.volcengineapi.com";
const VOLC_HOST = "open.volcengineapi.com";
const ECS_VERSION = "2020-04-01";

function percentEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function canonicalQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
}

function volcDateParts(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { xDate: iso, shortDate: iso.slice(0, 8) };
}

function signVolcRequest({ method, path = "/", query, body = "", region, service = "ecs", ak, sk }) {
  const { xDate, shortDate } = volcDateParts();
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": "application/json",
    host: VOLC_HOST,
    "x-content-sha256": payloadHash,
    "x-date": xDate,
  };
  const signedHeaderKeys = ["host", "x-content-sha256", "x-date"];
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join("");
  const queryString = canonicalQuery(query);
  const canonicalRequest = [method, path, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(sk, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "request");
  const signature = hmac(kSigning, stringToSign, "hex");
  headers.Authorization = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers, queryString };
}

export class VolcEcsClient {
  constructor({
    ak = env("VOLC_AK"),
    sk = env("VOLC_SK"),
    region = env("VOLC_REGION", "cn-shanghai"),
    dryRun = false,
    timeoutMs = 15000,
  } = {}) {
    this.ak = ak;
    this.sk = sk;
    this.region = region;
    this.dryRun = dryRun;
    this.timeoutMs = timeoutMs;
  }

  async call(action, { method = "GET", params = {}, body = null, timeoutMs = this.timeoutMs } = {}) {
    const query = { Action: action, Version: ECS_VERSION, ...params };
    const requestBody = body == null ? "" : JSON.stringify(body);
    if (this.dryRun) {
      logJson("volc.openapi.dry_run", { action, method, params: query, body: body ? redact(body) : null });
      return { dryRun: true, Action: action, Result: {} };
    }
    if (!this.ak || !this.sk || !this.region) {
      throw new Error("VOLC_AK, VOLC_SK, and VOLC_REGION are required for Volcengine OpenAPI calls");
    }
    const { headers, queryString } = signVolcRequest({
      method,
      query,
      body: requestBody,
      region: this.region,
      ak: this.ak,
      sk: this.sk,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${VOLC_ENDPOINT}/?${queryString}`, {
        method,
        signal: controller.signal,
        headers,
        body: method === "GET" ? undefined : requestBody,
      });
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      if (!response.ok || data.ResponseMetadata?.Error) {
        throw new Error(`Volc OpenAPI ${action} failed: ${response.status} ${JSON.stringify(redact(data)).slice(0, 800)}`);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async describeInstances() {
    const response = await this.call("DescribeInstances", {
      method: "GET",
      params: {
        RegionId: this.region,
        MaxResults: 100,
      },
    });
    const result = response.Result || response;
    const instances =
      result.Instances ||
      result.InstanceSet ||
      result.instances ||
      result.InstanceSets ||
      result.List ||
      [];
    return Array.isArray(instances) ? instances : instances.Instance || instances.Items || [];
  }

  async runCommand({ instanceIds, command, commandName = "versecraft-autoops", timeout = 60, username = "root" }) {
    if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
      throw new Error("At least one ECS instance id is required");
    }
    const encoded = Buffer.from(command, "utf8").toString("base64");
    const body = {
      RegionId: this.region,
      InstanceIds: instanceIds,
      InvocationName: "versecraft",
      Description: commandName,
      Type: "Shell",
      CommandContent: encoded,
      ContentEncoding: "Base64",
      Timeout: timeout,
      Username: username,
      WorkingDir: "/tmp",
    };
    const response = await this.call("RunCommand", { method: "POST", body });
    const result = response.Result || response;
    await writeRuntimeJson("volc-command-result.json", {
      action: "RunCommand",
      instance_ids: instanceIds,
      command_name: commandName,
      response: result,
      recorded_at: new Date().toISOString(),
    });
    return result;
  }

  async describeInvocationResults({ invocationId, commandId, instanceId }) {
    const params = {
      RegionId: this.region,
      MaxResults: 20,
      ContentEncoding: "Base64",
    };
    if (invocationId) params.InvocationId = invocationId;
    if (commandId) params.CommandId = commandId;
    if (instanceId) params.InstanceId = instanceId;
    const response = await this.call("DescribeInvocationResults", { method: "GET", params });
    const result = response.Result || response;
    await writeRuntimeJson("volc-command-result.json", {
      action: "DescribeInvocationResults",
      query: params,
      response: result,
      recorded_at: new Date().toISOString(),
    });
    return result;
  }
}

export class VolcOpenApiClient {
  constructor({
    ak = env("VOLC_AK"),
    sk = env("VOLC_SK"),
    region = env("VOLC_REGION", "cn-shanghai"),
    dryRun = false,
  } = {}) {
    this.ak = ak;
    this.sk = sk;
    this.region = region;
    this.dryRun = dryRun;
  }

  async call({
    service,
    version,
    action,
    method = "POST",
    params = {},
    body = null,
    timeoutMs = 15000,
  }) {
    if (!service || !version || !action) {
      throw new Error("service, version, and action are required for Volcengine OpenAPI calls");
    }
    const query = { Action: action, Version: version, ...params };
    const requestBody = body == null ? "" : JSON.stringify(body);
    if (this.dryRun) {
      logJson("volc.openapi.dry_run", {
        service,
        version,
        action,
        method,
        params: query,
        body: body ? redact(body) : null,
      });
      return { dryRun: true, Action: action, Result: {} };
    }
    if (!this.ak || !this.sk || !this.region) {
      throw new Error("VOLC_AK, VOLC_SK, and VOLC_REGION are required for Volcengine OpenAPI calls");
    }
    const { headers, queryString } = signVolcRequest({
      method,
      query,
      body: requestBody,
      region: this.region,
      service,
      ak: this.ak,
      sk: this.sk,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${VOLC_ENDPOINT}/?${queryString}`, {
        method,
        signal: controller.signal,
        headers,
        body: method === "GET" ? undefined : requestBody,
      });
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      if (!response.ok || data.ResponseMetadata?.Error) {
        throw new Error(
          `Volc OpenAPI ${service}.${action} failed: ${response.status} ${JSON.stringify(redact(data)).slice(0, 1200)}`
        );
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function filterVerseCraftInstances(instances = []) {
  return instances.filter((instance) => {
    const text = JSON.stringify(instance).toLowerCase();
    return text.includes("versecraft") || text.includes("coolify") || text.includes("cn-shanghai");
  });
}

export async function discoverVolcInstances({ dryRun = false } = {}) {
  const existing = env("VOLC_ECS_INSTANCE_IDS");
  if (existing) {
    return { instanceIds: existing.split(",").map((item) => item.trim()).filter(Boolean), source: "env", confidence: "high" };
  }
  const client = new VolcEcsClient({ dryRun });
  const instances = await client.describeInstances();
  const matches = filterVerseCraftInstances(instances);
  const mapped = matches.map((instance) => ({
    instance_id: instance.InstanceId || instance.instance_id || instance.Id || instance.id,
    name: instance.InstanceName || instance.Name || instance.name,
    status: instance.Status || instance.status,
    zone_id: instance.ZoneId || instance.zone_id,
    private_ip: instance.PrivateIpAddress || instance.PrivateIpAddresses,
    public_ip: instance.EipAddress || instance.PublicIpAddress || instance.PublicIpAddresses,
  }));
  const report = {
    discovered_at: new Date().toISOString(),
    match_count: mapped.length,
    matches: mapped,
  };
  await writeRuntimeJson("volc-discovery.json", report);
  if (mapped.length === 1 && mapped[0].instance_id) {
    return { instanceIds: [mapped[0].instance_id], source: "volcengine", confidence: "high", report };
  }
  return { instanceIds: [], source: "volcengine", confidence: "low", report };
}
