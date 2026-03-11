#!/usr/bin/env node
import { execSync } from "child_process";
execSync("pnpm exec drizzle-kit push --force", { stdio: "inherit" });
