import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The suite currently covers pure logic only (no DOM, no IndexedDB). Any
    // future component tests should switch the relevant files to jsdom via a
    // per-file `// @vitest-environment jsdom` pragma.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
