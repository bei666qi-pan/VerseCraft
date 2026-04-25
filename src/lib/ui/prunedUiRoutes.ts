export const PRUNED_UI_ROUTE_PREFIXES = [
  "/guide",
  "/help",
  "/tutorial",
  "/manual",
  "/notes",
  "/journal",
  "/inspiration",
  "/memo",
  "/inventory",
  "/warehouse",
  "/storage",
  "/bag",
  "/backpack",
  "/items",
  "/repository",
  "/repositories",
  "/achievement",
  "/achievements",
  "/badge",
  "/badges",
  "/trophy",
  "/trophies",
  "/weapon",
  "/weapons",
  "/armory",
  "/arsenal",
  "/equipment",
  "/equip",
  "/taskbar",
  "/tasks",
  "/task",
  "/toolbar",
  "/dock",
  "/bottom-bar",
  "/sidebar",
  "/action-bar",
] as const;

export const PRUNED_UI_REDIRECT_PATH = "/play";

export function getPrunedUiRedirectPath(pathname: string): typeof PRUNED_UI_REDIRECT_PATH | null {
  const normalized = normalizePathname(pathname);
  if (!normalized) return null;

  for (const prefix of PRUNED_UI_ROUTE_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return PRUNED_UI_REDIRECT_PATH;
    }
  }

  return null;
}

function normalizePathname(pathname: string): string {
  const raw = typeof pathname === "string" ? pathname.trim() : "";
  if (!raw) return "";
  const withoutQuery = raw.split(/[?#]/, 1)[0] ?? "";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const withoutTrailingSlash =
    withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/u, "") : withLeadingSlash;
  return withoutTrailingSlash.toLowerCase();
}
