#!/usr/bin/env node
import { verifyProductionAdmin } from "./lib/admin-site.mjs";

const baseUrl = String(process.env.SITE_URL ?? "https://versecraft.cn").trim();
const adminPassword = String(process.env.ADMIN_PASSWORD ?? "").trim();
if (!adminPassword) throw new Error("ADMIN_PASSWORD secret is required");

const result = await verifyProductionAdmin({ baseUrl, adminPassword });
console.log(JSON.stringify({ event: "production_admin_attestation", ...result }));
if (!result.ok) process.exitCode = 1;
