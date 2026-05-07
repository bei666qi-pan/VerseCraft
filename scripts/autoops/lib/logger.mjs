import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

export const AUTOOPS_ROOT = path.resolve(process.cwd(), ".ops", "autoops");
export const AUTOOPS_RUNTIME_DIR = path.join(AUTOOPS_ROOT, "runtime");

const SENSITIVE_KEY_RE = /(^|_)(secret|token|password|api[-_]?key|access[-_]?key|ak|sk|authorization)(_|$)/i;

export async function ensureRuntimeDir() {
  await mkdir(AUTOOPS_RUNTIME_DIR, { recursive: true });
  return AUTOOPS_RUNTIME_DIR;
}

export function redact(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (SENSITIVE_KEY_RE.test(key)) {
        return [key, item ? "[REDACTED]" : item];
      }
      return [key, redact(item)];
    })
  );
}

export function logJson(event, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...redact(data),
  };
  console.log(JSON.stringify(payload));
}

export function warnJson(event, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level: "warn",
    event,
    ...redact(data),
  };
  console.warn(JSON.stringify(payload));
}

export function errorJson(event, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level: "error",
    event,
    ...redact(data),
  };
  console.error(JSON.stringify(payload));
}

export async function writeRuntimeJson(name, data) {
  await ensureRuntimeDir();
  const file = path.join(AUTOOPS_RUNTIME_DIR, name);
  await writeFile(file, `${JSON.stringify(redact(data), null, 2)}\n`, "utf8");
  return file;
}

export async function writeRuntimeText(name, content) {
  await ensureRuntimeDir();
  const file = path.join(AUTOOPS_RUNTIME_DIR, name);
  await writeFile(file, content, "utf8");
  return file;
}

export async function readJsonIfExists(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }
    const trimmed = arg.slice(2);
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex >= 0) {
      result[toCamel(trimmed.slice(0, equalsIndex))] = trimmed.slice(equalsIndex + 1);
      continue;
    }
    const key = toCamel(trimmed);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

export function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(raw);
}

export function env(name, fallback = "") {
  const raw = process.env[name];
  return raw == null || raw === "" ? fallback : raw;
}

export function autoopsDefaults() {
  return {
    siteUrl: env("AUTOOPS_SITE_URL", "https://versecraft.cn"),
    healthUrl: env("AUTOOPS_HEALTH_URL", "https://versecraft.cn/api/health"),
    repo: env("AUTOOPS_REPO", "bei666qi-pan/VerseCraft"),
    branch: env("AUTOOPS_BRANCH", "main"),
  };
}

export async function loadLocalEnvFiles() {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    let content = "";
    try {
      content = await readFile(path.resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] == null) {
        process.env[key] = value;
      }
    }
  }
  loadWindowsUserEnvFallback();
}

function loadWindowsUserEnvFallback() {
  if (process.platform !== "win32") {
    return;
  }
  const names = [
    "VOLC_AK",
    "VOLC_SK",
    "VOLC_REGION",
    "GITHUB_TOKEN",
    "COOLIFY_API_KEY",
    "COOLIFY_BASE_URL",
    "COOLIFY_APP_UUID",
    "VOLC_ECS_INSTANCE_IDS",
    "AUTOOPS_ALERT_ROUTER_SECRET",
    "OPENAI_API_KEY",
  ].filter((name) => !process.env[name]);
  if (!names.length) {
    return;
  }
  const script = `
    $names = @(${names.map((name) => `'${name.replace(/'/g, "''")}'`).join(",")})
    $out = @{}
    foreach ($name in $names) {
      $value = [Environment]::GetEnvironmentVariable($name, 'User')
      if (-not $value) { $value = [Environment]::GetEnvironmentVariable($name, 'Machine') }
      if ($value) { $out[$name] = $value }
    }
    $out | ConvertTo-Json -Compress
  `;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    return;
  }
  try {
    const values = JSON.parse(result.stdout);
    for (const [key, value] of Object.entries(values)) {
      if (value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore malformed shell output; the caller will report missing variables.
  }
}
