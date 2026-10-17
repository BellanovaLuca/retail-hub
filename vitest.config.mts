import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  // tsconfig usa `jsx: "preserve"` (lo trasforma Next): nei test serve il runtime automatico.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // I test dei componenti dichiarano `// @vitest-environment jsdom`; gli altri restano in node.
    include: [
      "tests/unit/**/*.test.ts",
      "tests/**/*.test.tsx",
      "lib/**/*.test.ts",
      "components/**/*.test.{ts,tsx}",
    ],
    environment: "node",
  },
});
