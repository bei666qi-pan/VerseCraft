#!/usr/bin/env node
import { CoolifyClient } from "./lib/coolify.mjs";

const appUuid = String(process.env.COOLIFY_APP_UUID ?? "").trim();
const adminPassword = String(process.env.ADMIN_PASSWORD ?? "").trim();

if (!appUuid) throw new Error("COOLIFY_APP_UUID is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD secret is required");

const result = await new CoolifyClient().upsertApplicationEnv(
  appUuid,
  "ADMIN_PASSWORD",
  adminPassword,
);

console.log(JSON.stringify({ key: result.key, method: result.method, updated: result.updated }));
