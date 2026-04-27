import type { MetadataRoute } from "next";
import { envBoolean } from "@/lib/config/envRaw";
import { isPreviewEnvironmentSignal } from "@/lib/config/previewGuards";

export default function robots(): MetadataRoute.Robots {
  if (envBoolean("PREVIEW_SITE_NOINDEX", false) || isPreviewEnvironmentSignal()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
