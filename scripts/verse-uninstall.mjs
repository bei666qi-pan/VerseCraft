#!/usr/bin/env node
/**
 * verse CLI uninstaller.
 *
 * Usage: pnpm verse:uninstall
 *
 * Removes ~/.local/bin/verse symlink.
 * Does NOT remove ~/.local/bin or PATH entries (safe).
 */

import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const LOCAL_BIN = join(HOME, ".local", "bin");
const VERSE_BIN = join(LOCAL_BIN, "verse");

console.log("\n\x1b[1m\x1b[36mVerseCraft CLI Uninstaller\x1b[0m\n");

if (existsSync(VERSE_BIN)) {
  unlinkSync(VERSE_BIN);
  console.log(`  Removed: ${VERSE_BIN}`);
  console.log(`\n\x1b[32mUninstalled.\x1b[0m`);
} else {
  console.log(`  No installation found at ${VERSE_BIN}`);
}

console.log(`  ~/.local/bin and PATH entries were preserved.\n`);
