import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Reuse the repo's src aliases so the probe exercises the SAME source as the
// real suite. Base is this config's dir: docs/lab/tmp-verify-cli-trust/.
const pkg = (name: string) =>
  fileURLToPath(new URL(`../../../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@rosterhq/shared": pkg("shared"),
      "@rosterhq/coach": pkg("coach"),
      "@rosterhq/playbook": pkg("playbook"),
      "@rosterhq/router": pkg("router"),
      "@rosterhq/combine": pkg("combine"),
    },
  },
  test: {
    include: [fileURLToPath(new URL("./*.test.ts", import.meta.url))],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
