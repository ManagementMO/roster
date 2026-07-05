import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) =>
  fileURLToPath(new URL(`../../../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  root: "/Users/mo/Downloads/roster",
  resolve: {
    alias: {
      "@rosterhq/shared": pkg("shared"),
      "@rosterhq/coach": pkg("coach"),
    },
  },
  test: {
    include: ["docs/lab/tmp-verify-test-rigor/**/*.test.ts"],
  },
});
