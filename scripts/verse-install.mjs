#!/usr/bin/env node
/**
 * verse CLI installer.
 *
 * Usage: pnpm verse:install
 *
 * Creates ~/.local/bin/verse pointing to the CLI in this repo.
 * Adds ~/.local/bin to PATH in ~/.zshrc (idempotent).
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync, appendFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CLI_SRC = resolve(REPO_ROOT, "scripts", "verse-cli.mjs");
const HOME = homedir();
const LOCAL_BIN = join(HOME, ".local", "bin");
const VERSE_BIN = join(LOCAL_BIN, "verse");
const ZSHRC = join(HOME, ".zshrc");
const BASHRC = join(HOME, ".bashrc");

console.log("\n\x1b[1m\x1b[36mVerseCraft CLI Installer\x1b[0m\n");

// 1. Verify CLI source exists
if (!existsSync(CLI_SRC)) {
  console.error(`\x1b[31mError: CLI source not found: ${CLI_SRC}\x1b[0m`);
  process.exit(1);
}

// 2. Create ~/.local/bin if needed
if (!existsSync(LOCAL_BIN)) {
  mkdirSync(LOCAL_BIN, { recursive: true });
  console.log(`  Created: ${LOCAL_BIN}`);
}

// 3. Write the verse wrapper script
const wrapper = `#!/usr/bin/env bash
# verse — VerseCraft CLI
# Installed by pnpm verse:install from ${REPO_ROOT}
exec node "${CLI_SRC}" "$@"
`;

writeFileSync(VERSE_BIN, wrapper, { mode: 0o755 });
chmodSync(VERSE_BIN, 0o755);
console.log(`  Installed: ${VERSE_BIN}`);

// 4. Add ~/.local/bin to PATH in shell config (idempotent)
const pathLine = `export PATH="${LOCAL_BIN}:$PATH"`;

function ensurePathInShell(file) {
  if (existsSync(file)) {
    const content = readFileSync(file, "utf-8");
    if (content.includes(LOCAL_BIN)) {
      console.log(`  PATH already configured in ${file}`);
      return;
    }
  }

  // Append
  const block = `\n# Added by verse CLI installer\n${pathLine}\n`;
  appendFileSync(file, block, "utf-8");
  console.log(`  Added PATH to ${file}`);
}

ensurePathInShell(ZSHRC);
if (existsSync(BASHRC)) {
  ensurePathInShell(BASHRC);
}

// 5. Verify installation
try {
  const { execSync } = require("node:child_process");
  const ver = execSync(`"${VERSE_BIN}" --version`, { encoding: "utf-8", timeout: 5000 }).trim();
  console.log(`\n  \x1b[32m✓ Installation verified: ${ver}\x1b[0m`);
} catch {
  console.log(`\n  \x1b[33m⚠ Could not verify. Try: ${VERSE_BIN} --version\x1b[0m`);
}

console.log(`\n\x1b[32mDone! Run \x1b[1mverse -ds\x1b[0m\x1b[32m to start a self-improving campaign.\x1b[0m`);
console.log(`\n  If "verse" is not found, restart your terminal or run:`);
console.log(`    source ~/.zshrc\n`);
