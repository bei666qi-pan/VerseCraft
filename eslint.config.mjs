import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Project-wide: allow gradual typing migration.
      "@typescript-eslint/no-explicit-any": "off",
      // React 19 + complex UI flows: allow state sync in effects where needed.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/lib/ai/**/*.ts", "**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/ai/router/execute",
              message:
                "Do not import the stream router from general app code; use /api/chat or server-only service entrypoints.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".claude/**",
    ".runtime-data/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
