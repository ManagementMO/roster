import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSuite, template } from "./task.js";
import { runSuite } from "./runner.js";
import { buildLabResults } from "./results.js";

const FIXTURE_SERVER = fileURLToPath(
  new URL("../test/fixtures/fake-fs-server.mjs", import.meta.url),
);
// The fixture imports the SDK — resolve it from the combine package's own deps.
const SDK_CWD = fileURLToPath(new URL("..", import.meta.url));

const SUITE_YAML = `
suite: fake-fs-smoke
version: "0.0.1"
category: filesystem
tasks:
  - id: fs.write-then-verify
    description: write a file and verify the end state on disk
    invoke:
      tool: write_file
      args: { path: "out/hello-{{run_id}}.txt", content: "hello combine" }
    verify:
      - { kind: fileEquals, path: "out/hello-{{run_id}}.txt", equals: "hello combine" }
      - { kind: dirExists, path: "out" }
  - id: fs.read-seeded
    description: read a seeded file back
    setup:
      files: { "seed.txt": "seeded-{{run_id}}" }
    invoke:
      tool: read_text_file
      args: { path: "seed.txt" }
    verify:
      - { kind: resultContains, contains: "seeded-{{run_id}}" }
  - id: fs.failure-is-a-failure
    description: a tool error must never count as a pass
    invoke:
      tool: always_fails
      args: {}
    verify:
      - { kind: resultContains, contains: "anything" }
  - id: fs.verify-catches-wrong-state
    description: verifier must fail when the end state is wrong
    invoke:
      tool: write_file
      args: { path: "a.txt", content: "actual" }
    verify:
      - { kind: fileEquals, path: "a.txt", equals: "expected-something-else" }
`;

describe("suite parsing", () => {
  it("parses and validates", () => {
    const suite = parseSuite(SUITE_YAML);
    expect(suite.tasks).toHaveLength(4);
    expect(suite.tasks[0]?.signed).toBe(false);
    expect(suite.tasks[0]?.mode).toBe("sandboxed");
  });

  it("rejects unverifiable tasks and duplicate ids", () => {
    expect(() =>
      parseSuite(`suite: s\nversion: "1"\ncategory: c\ntasks:\n  - id: a\n    invoke: {tool: t}\n`),
    ).toThrow(/verify/);
    expect(() =>
      parseSuite(
        `suite: s\nversion: "1"\ncategory: c\ntasks:\n  - {id: a, invoke: {tool: t}, verify: [{kind: fileExists, path: x}]}\n  - {id: a, invoke: {tool: t}, verify: [{kind: fileExists, path: x}]}\n`,
      ),
    ).toThrow(/duplicate/);
  });

  it("templates {{sandbox}} and {{run_id}} recursively", () => {
    const out = template(
      { a: "{{sandbox}}/x", b: ["{{run_id}}"], c: 3 },
      { sandbox: "/tmp/s", runId: "r1" },
    );
    expect(out).toEqual({ a: "/tmp/s/x", b: ["r1"], c: 3 });
  });
});

describe("runner against a real stdio server", () => {
  it("runs the suite: passes pass, failures fail at the right stage", async () => {
    const suite = parseSuite(SUITE_YAML);
    const run = await runSuite(suite, {
      name: "fake-fs",
      command: process.execPath,
      args: [FIXTURE_SERVER, "{{sandbox}}"],
      env: { ...process.env, NODE_PATH: path.join(SDK_CWD, "node_modules") } as Record<string, string>,
    });

    const byId = Object.fromEntries(run.results.map((r) => [r.taskId, r]));
    expect(byId["fs.write-then-verify"]).toMatchObject({ pass: true, stage: null });
    expect(byId["fs.read-seeded"]).toMatchObject({ pass: true });
    expect(byId["fs.failure-is-a-failure"]).toMatchObject({ pass: false, stage: "invoke" });
    expect(byId["fs.verify-catches-wrong-state"]).toMatchObject({ pass: false, stage: "verify" });
  }, 30_000);

  it("distinguishes a directory from a regular file (dirExists vs fileExists)", async () => {
    // A server that writes a FILE must NOT certify a task expecting a DIRECTORY,
    // and vice-versa — the create_directory certification hole.
    const typesSuite = parseSuite(`
suite: types
version: "0.0.1"
category: filesystem
tasks:
  - id: ok.dir-and-file
    invoke: { tool: write_file, args: { path: "d/f-{{run_id}}.txt", content: "x" } }
    verify:
      - { kind: dirExists, path: "d" }
      - { kind: fileExists, path: "d/f-{{run_id}}.txt" }
  - id: bad.file-cannot-satisfy-dir
    invoke: { tool: write_file, args: { path: "g-{{run_id}}.txt", content: "x" } }
    verify:
      - { kind: dirExists, path: "g-{{run_id}}.txt" }
  - id: bad.dir-cannot-satisfy-file
    invoke: { tool: write_file, args: { path: "e/f-{{run_id}}.txt", content: "x" } }
    verify:
      - { kind: fileExists, path: "e" }
  - id: bad.case-variant-is-not-exact
    invoke: { tool: write_file, args: { path: "Cased-{{run_id}}.txt", content: "x" } }
    verify:
      - { kind: fileExists, path: "cased-{{run_id}}.txt" }
`);
    const run = await runSuite(typesSuite, {
      name: "fake-fs",
      command: process.execPath,
      args: [FIXTURE_SERVER, "{{sandbox}}"],
      env: { ...process.env, NODE_PATH: path.join(SDK_CWD, "node_modules") } as Record<string, string>,
    });
    const byId = Object.fromEntries(run.results.map((r) => [r.taskId, r]));
    expect(byId["ok.dir-and-file"]).toMatchObject({ pass: true });
    expect(byId["bad.file-cannot-satisfy-dir"]).toMatchObject({ pass: false, stage: "verify" });
    expect(byId["bad.dir-cannot-satisfy-file"]).toMatchObject({ pass: false, stage: "verify" });
    // A case-variant name must NOT satisfy the verifier — on macOS/APFS
    // fs.existsSync would false-pass; the byte-exact readdir check catches it.
    expect(byId["bad.case-variant-is-not-exact"]).toMatchObject({ pass: false, stage: "verify" });
  }, 30_000);

  it("summarizes into lab-results with Wilson and signed separation", async () => {
    const suite = parseSuite(SUITE_YAML);
    const run = await runSuite(suite, {
      name: "fake-fs",
      command: process.execPath,
      args: [FIXTURE_SERVER, "{{sandbox}}"],
    });
    const lab = buildLabResults([run], new Date("2026-07-05T00:00:00Z"));
    const summary = lab.runs[0]!.summary;
    expect(summary.n).toBe(4);
    expect(summary.passes).toBe(2);
    expect(summary.signedN).toBe(0);
    expect(summary.wilsonLb).toBeGreaterThan(0);
    expect(summary.wilsonLb).toBeLessThan(0.5 + 0.001);
  }, 30_000);
});

/**
 * BINDING LAW: tool results are never persisted and never logged.
 *
 * `detail` is written into the published lab-results.json AND printed to the
 * terminal. Round 5 (R5-04) walked a synthetic marker out of a backend's isError
 * result and into both. A failing tool's own words are the single most likely
 * place for a credential, a private path, or the caller's arguments to appear —
 * so what a run may record is the STRUCTURAL fact of failure, never its text.
 */
describe("privacy law: a tool's result text never reaches an artifact or a log (R5-04)", () => {
  const failSuite = parseSuite(`
suite: privacy
version: "0.0.1"
category: filesystem
tasks:
  - id: leaks.isError
    invoke: { tool: always_fails, args: {} }
    verify:
      - { kind: resultContains, contains: "never-reached" }
`);

  it("an isError result's text reaches neither detail nor the serialized artifact", async () => {
    const run = await runSuite(failSuite, {
      name: "fake-fs",
      command: process.execPath,
      args: [FIXTURE_SERVER, "{{sandbox}}"],
    });
    const r = run.results[0]!;
    expect(r.pass).toBe(false);
    expect(r.stage).toBe("invoke");
    // Structural fact only — the tool failed. Not WHAT it said.
    expect(r.detail).toBe("tool-returned-isError");

    // The whole published artifact must be free of the result's content.
    const artifact = JSON.stringify(buildLabResults([run], new Date("2026-07-05T00:00:00Z")));
    expect(artifact).not.toContain("COMBINE_SECRET_MUST_NOT_PERSIST_a1b2c3");
    expect(artifact).not.toContain("sk-live-9f7a");
    expect(artifact).not.toContain("/Users/private/vault.txt");
    expect(artifact).not.toContain("always_fails"); // not even the echoed tool text
  }, 30_000);

  it("a transport failure records an errno, not the command path it tried to spawn", async () => {
    const run = await runSuite(failSuite, {
      name: "missing-binary",
      command: "/definitely/not/a/real/binary-xyz",
      args: [],
    });
    const r = run.results[0]!;
    expect(r.stage).toBe("transport");
    // The load-bearing property (R5-04): `detail` is a STRUCTURAL code, not a
    // message, and the command path never leaks. The exact code is platform-
    // specific — POSIX raises ENOENT (`system-error:ENOENT`); Windows surfaces the
    // failed spawn as a closed connection (`mcp-error:-32000`) — so assert the
    // SHAPE, not one platform's value.
    expect(r.detail).toMatch(/^(system-error:[A-Z0-9_]+|mcp-error:-?\d+|connect-timeout|unknown-error)$/);
    expect(JSON.stringify(run)).not.toContain("/definitely/not/a/real/binary-xyz");
  }, 30_000);

  it("verifier failures still say something useful (they are suite-derived, not result text)", async () => {
    // The diagnosis must not be thrown away with the leak: a verifier message is
    // built from the task's own declared paths, which are already public.
    const suite = parseSuite(`
suite: privacy
version: "0.0.1"
category: filesystem
tasks:
  - id: verify.fails
    invoke: { tool: write_file, args: { path: "a.txt", content: "actual" } }
    verify:
      - { kind: fileEquals, path: "a.txt", equals: "expected-something-else" }
`);
    const run = await runSuite(suite, {
      name: "fake-fs",
      command: process.execPath,
      args: [FIXTURE_SERVER, "{{sandbox}}"],
    });
    const r = run.results[0]!;
    expect(r.stage).toBe("verify");
    expect(r.detail).toBe("content mismatch in a.txt"); // task-derived, safe, and diagnostic
  }, 30_000);
});
