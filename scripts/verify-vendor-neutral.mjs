import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const excludedDirectories = new Set([
  ".git",
  ".next",
  ".pnpm",
  "coverage",
  "node_modules",
  "test-results",
]);
const retiredMarkers = [
  new RegExp(["san", "gfor"].join(""), "i"),
  new RegExp(String.fromCodePoint(0x6df1, 0x4fe1, 0x670d), "i"),
];

function hasRetiredMarker(value) {
  return retiredMarkers.some((marker) => marker.test(value));
}

function collectMatches(directory, matches) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    const relativePath = path.relative(projectRoot, filePath);
    if (hasRetiredMarker(entry.name)) matches.add(relativePath);
    if (entry.isDirectory()) {
      collectMatches(filePath, matches);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      if (hasRetiredMarker(fs.readFileSync(filePath, "utf8"))) matches.add(relativePath);
    } catch {
      // Ignore unreadable or non-text files; the cleanup scope is repository text.
    }
  }
}

function removeLocalMarkers() {
  const envPath = path.join(projectRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    const gatewayMarkerPresent = lines.some((line) => hasRetiredMarker(line));
    const cleanedLines = lines
      .filter((line) => !hasRetiredMarker(line))
      .map((line) => {
        if (!gatewayMarkerPresent) return line;
        if (/^(AI_GATEWAY_BASE_URL|AI_GATEWAY_API_KEY)=/.test(line)) {
          return `${line.split("=", 1)[0]}=`;
        }
        return line;
      });
    fs.writeFileSync(envPath, cleanedLines.join("\n"));
  }

  const settingsPath = path.join(projectRoot, ".claude/settings.local.json");
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const allow = settings?.permissions?.allow;
    if (Array.isArray(allow)) {
      settings.permissions.allow = allow.filter((entry) => !hasRetiredMarker(entry));
      fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    }
  }
}

if (process.argv.includes("--remove-local")) removeLocalMarkers();

const matches = new Set();
collectMatches(projectRoot, matches);
if (matches.size > 0) {
  for (const match of [...matches].sort()) console.error(`retired-provider marker: ${match}`);
  process.exitCode = 1;
} else {
  console.log("Vendor-neutral verification passed.");
}
