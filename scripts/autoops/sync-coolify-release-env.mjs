#!/usr/bin/env node
import { CoolifyClient } from "./lib/coolify.mjs";

const appUuid = String(process.env.COOLIFY_APP_UUID ?? "").trim();
const adminPassword = String(process.env.ADMIN_PASSWORD ?? "").trim();
const deploySha = String(process.env.DEPLOY_SHA ?? "").trim();

if (!appUuid) throw new Error("COOLIFY_APP_UUID is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD secret is required");
if (!/^[0-9a-f]{40}$/i.test(deploySha)) throw new Error("DEPLOY_SHA must be a full 40-character git SHA");

const client = new CoolifyClient();
const results = [];
for (const [key, value] of [["ADMIN_PASSWORD", adminPassword], ["BUILD_ID", deploySha]]) {
  results.push(await client.upsertApplicationEnv(appUuid, key, value));
}

console.log(JSON.stringify({
  updated: results.every((result) => result.updated),
  keys: results.map((result) => ({ key: result.key, method: result.method })),
}));
