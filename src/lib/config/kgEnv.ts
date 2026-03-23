import "server-only";

import { envBoolean } from "@/lib/config/envRaw";

export function isKgLayerEnabled(): boolean {
  return envBoolean("VC_KG_ENABLED", true);
}

