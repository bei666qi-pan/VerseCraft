import { CONTENT_PACKS } from "@/lib/contentSpec/packs";
import { validateContentPacks } from "@/lib/contentSpec/validators";

const { issues } = validateContentPacks(CONTENT_PACKS);
const errors = issues.filter((x) => x.severity === "error");
const warnings = issues.filter((x) => x.severity === "warning");

if (warnings.length > 0) {
  console.warn(`[content:validate] warnings=${warnings.length}`);
  for (const w of warnings.slice(0, 80)) {
    console.warn(`- [${w.code}] ${w.message}${w.ref ? ` (${w.ref.kind}:${w.ref.id})` : ""}`);
  }
}

if (errors.length > 0) {
  console.error(`[content:validate] errors=${errors.length}`);
  for (const e of errors.slice(0, 80)) {
    console.error(`- [${e.code}] ${e.message}${e.ref ? ` (${e.ref.kind}:${e.ref.id})` : ""}`);
  }
  process.exit(1);
}

console.log("[content:validate] OK");

