#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AUTOOPS_RUNTIME_DIR, autoopsDefaults, loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

async function copyIfExists(from, to) {
  await cp(from, to, { recursive: true });
}

function compressDirectory(source, archivePath) {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Compress-Archive -Path '${source}\\*' -DestinationPath '${archivePath}' -Force`],
      { encoding: "utf8" }
    );
    return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
  }
  const result = spawnSync("sh", ["-lc", `cd "${source}" && zip -qr "${archivePath}" .`], { encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const packageDir = path.join(AUTOOPS_RUNTIME_DIR, "vefaas-alert-router-package");
  const archivePath = path.join(AUTOOPS_RUNTIME_DIR, "vefaas-alert-router.zip");
  if (!path.resolve(packageDir).startsWith(path.resolve(AUTOOPS_RUNTIME_DIR))) {
    throw new Error("Refusing to package outside autoops runtime directory.");
  }
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(path.join(packageDir, "ops"), { recursive: true });
  await mkdir(path.join(packageDir, "scripts", "autoops"), { recursive: true });
  await copyIfExists(path.resolve("ops", "vefaas-alert-router"), path.join(packageDir, "ops", "vefaas-alert-router"));
  await copyIfExists(path.resolve("scripts", "autoops", "lib"), path.join(packageDir, "scripts", "autoops", "lib"));
  await writeFile(
    path.join(packageDir, "index.mjs"),
    `export { handler } from "./ops/vefaas-alert-router/index.mjs";\n`,
    "utf8"
  );
  await writeFile(
    path.join(packageDir, "index.js"),
    await readFile(path.resolve("ops", "vefaas-alert-router", "index.cjs"), "utf8"),
    "utf8"
  );
  const compression = dryRun ? { ok: true, dryRun: true } : compressDirectory(packageDir, archivePath);
  const webhookBase = process.env.AUTOOPS_APIG_BASE_URL || "https://<your-apig-domain>";
  const report = {
    generated_at: new Date().toISOString(),
    package_dir: packageDir,
    archive_path: archivePath,
    compression,
    function_name: process.env.AUTOOPS_VEFAAS_FUNCTION_NAME || "versecraft-autoops-alert-router",
    route: "POST /autoops/alert",
    webhook_url: `${webhookBase.replace(/\/+$/g, "")}/autoops/alert?secret=<AUTOOPS_ALERT_ROUTER_SECRET>`,
    env_required: [
      "AUTOOPS_ALERT_ROUTER_SECRET",
      "GITHUB_TOKEN",
      "AUTOOPS_REPO",
      "COOLIFY_BASE_URL",
      "COOLIFY_API_KEY",
      "COOLIFY_APP_UUID",
      "VOLC_AK",
      "VOLC_SK",
      "VOLC_REGION",
      "VOLC_ECS_INSTANCE_IDS",
    ],
    note:
      "veFaaS/APIG OpenAPI provisioning varies by account/product version. This script packages the function and emits console steps; use Volcengine OpenAPI Explorer if your account exposes function/APIG create/update APIs.",
    defaults: autoopsDefaults(),
  };
  await writeRuntimeJson("vefaas-provision-report.json", report);
  await writeRuntimeJson("provision-result.json", {
    ok: Boolean(compression.ok),
    automated_cloud_create: false,
    reason:
      "veFaaS/APIG create/update OpenAPI parameters are account and product-version specific; this script packages the function and emits the shortest console handoff instead of guessing.",
    package_zip: archivePath,
    webhook_url: report.webhook_url,
    console_steps: [
      "Create or update Node.js 22 veFaaS function versecraft-autoops-alert-router.",
      "Upload .ops/autoops/runtime/vefaas-alert-router.zip.",
      "Set handler to index.handler.",
      "Configure the environment variable names listed in env_required.",
      "Create APIG route POST /autoops/alert and bind it to the function.",
      "Use the webhook URL shape in cloudmonitor-webhook-url.txt for test callbacks.",
    ],
    env_required: report.env_required,
    generated_at: report.generated_at,
  });
  await writeFile(path.join(AUTOOPS_RUNTIME_DIR, "cloudmonitor-webhook-url.txt"), `${report.webhook_url}\n`, "utf8");
  logJson("autoops.vefaas.package.completed", report);
  if (!compression.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
