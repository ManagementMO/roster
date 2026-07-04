import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@rosterhq/shared": pkg("shared"),
      "@rosterhq/coach": pkg("coach"),
      "@rosterhq/playbook": pkg("playbook"),
      "@rosterhq/router": pkg("router"),
      "@rosterhq/combine": pkg("combine"),
      "@rosterhq/league": pkg("league"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
