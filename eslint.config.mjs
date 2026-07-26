import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "playwright-report/**",
    // Vendored skill packs. Third-party code we do not author or maintain.
    ".claude/skills/**",
    ".github/skills/**",
    ".claude/hooks/**",
    ".github/hooks/**",
  ]),
  {
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "@/server/**"],
              message:
                "Server modules must not be imported into browser components.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/api/**/*.ts", "src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);
