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
