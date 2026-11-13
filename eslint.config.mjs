import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_`-prefixed bindings are intentionally unused (e.g. omitting a key via rest destructuring).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Architectural boundaries (docs/ARCHITECTURE.md §1): dependencies only point down.
  {
    files: ["src/system/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/desktop/*", "@/applications/*", "@/applications"], message: "System services must not depend on the desktop or on applications." }] },
      ],
    },
  },
  {
    files: ["src/applications/**/*.{ts,tsx}"],
    ignores: ["src/applications/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/desktop/*"], message: "Applications must use the App SDK (@/system/sdk/*), not desktop internals." },
            { group: ["@/applications/*"], message: "Applications must not import other applications; share code via @/system or @/ui." },
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
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
