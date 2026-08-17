import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@roster/shared": pkg("shared"),
      "@roster/coach": pkg("coach"),
      "@roster/playbook": pkg("playbook"),
      "@roster/router": pkg("router"),
      "@roster/combine": pkg("combine"),
      "@roster/league": fileURLToPath(new URL("./apps/league/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
    ],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
