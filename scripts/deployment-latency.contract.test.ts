import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("production Dockerfile fetches dependencies once and installs offline in both dependency stages", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /ARG NODE_IMAGE=docker\.m\.daocloud\.io\/library\/node:22-alpine/);
  assert.match(dockerfile, /FROM \$\{NODE_IMAGE\} AS base/);
  assert.match(dockerfile, /FROM base AS package-cache/);
  assert.match(dockerfile, /pnpm fetch --frozen-lockfile/);
  assert.match(dockerfile, /FROM package-cache AS deps/);
  assert.match(dockerfile, /FROM package-cache AS prod-deps/);
  assert.match(dockerfile, /pnpm install --offline --frozen-lockfile/);
  assert.match(dockerfile, /pnpm install --offline --frozen-lockfile --prod/);
  assert.doesNotMatch(dockerfile, /^RUN --mount=type=cache/m);
});

test("local ship defers the default Coolify trigger to the CI release owner", () => {
  const deploy = readFileSync("deploy.sh", "utf8");
  assert.match(deploy, /--local-coolify/);
  assert.match(deploy, /Skipping local Coolify trigger/);
});

test("the Gitee sync workflow uses the shared Coolify monitor for API deployments", () => {
  const workflow = readFileSync(".github/workflows/sync-gitee-preview.yml", "utf8");
  assert.match(workflow, /node scripts\/autoops\/coolify-deploy\.mjs --uuid/);
  assert.match(workflow, /api_owned=true/);
});
