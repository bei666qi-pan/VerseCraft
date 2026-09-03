#!/usr/bin/env node
import { parseArgs } from "./lib/logger.mjs";
import { CoolifyClient, deploymentStatus } from "./lib/coolify.mjs";
import { assessCoolifyApplicationStatus, verifyDeployedSite } from "./lib/deployed-site.mjs";

const args = parseArgs();
const healthUrl = String(args.healthUrl ?? process.env.HEALTH_URL ?? "").trim();
const expectedBuildId = String(args.expectedBuildId ?? process.env.EXPECTED_BUILD_ID ?? "").trim();

const result = await verifyDeployedSite({
  healthUrl,
  expectedBuildId,
  attempts: Number(args.attempts ?? 18),
  delayMs: Number(args.delayMs ?? 10_000),
  timeoutMs: Number(args.timeoutMs ?? 15_000),
  onAttempt: (attempt) => {
    console.log(JSON.stringify({ event: "deployment_attestation_attempt", ...attempt }));
  },
});

console.log(JSON.stringify({ event: "deployment_attestation_completed", ...result }));
if (!result.ok) {
  process.exitCode = 1;
} else {
  const coolifyValues = [
    process.env.COOLIFY_BASE_URL,
    process.env.COOLIFY_API_KEY,
    process.env.COOLIFY_APP_UUID,
  ].map((value) => String(value ?? "").trim());
  if (coolifyValues.some(Boolean) && !coolifyValues.every(Boolean)) {
    throw new Error("Coolify application attestation requires base URL, API key, and application UUID together");
  }
  if (coolifyValues.every(Boolean)) {
    const application = await new CoolifyClient().application(coolifyValues[2]);
    const status = deploymentStatus(application);
    const applicationResult = assessCoolifyApplicationStatus(status);
    console.log(JSON.stringify({ event: "coolify_application_attestation", status, ...applicationResult }));
    if (!applicationResult.ok) process.exitCode = 1;
  }
}
