import path from "node:path";
import { parseSuite } from "/Users/mo/Downloads/roster/packages/combine/dist/task.js";
import { runSuite as runReal } from "/Users/mo/Downloads/roster/packages/combine/dist/runner.js";
import { runSuite as runReverted } from "./runner_reverted.mjs";

const FIXTURE = "/Users/mo/Downloads/roster/packages/combine/test/fixtures/fake-fs-server.mjs";
const NODE_PATH = path.join("/Users/mo/Downloads/roster/packages/combine", "node_modules");

// Exact copies of the suites from combine.test.ts
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

const TYPES_YAML = `
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
`;

const server = {
  name: "fake-fs",
  command: process.execPath,
  args: [FIXTURE, "{{sandbox}}"],
  env: { ...process.env, NODE_PATH },
};

function digest(run) {
  return run.results.map(r => `${r.taskId}: pass=${r.pass} stage=${r.stage}`).sort();
}

let mismatches = 0;
for (const [label, yaml] of [["SUITE_YAML", SUITE_YAML], ["TYPES_YAML (line-97 test)", TYPES_YAML]]) {
  const suite = parseSuite(yaml);
  const realRun = await runReal(parseSuite(yaml), server);
  const revRun  = await runReverted(parseSuite(yaml), server);
  const a = digest(realRun), b = digest(revRun);
  const same = JSON.stringify(a) === JSON.stringify(b);
  console.log("\n### " + label + "  ->  identical results: " + same);
  for (let i=0;i<a.length;i++){
    const flag = a[i]===b[i] ? "  " : "DIFF";
    console.log(`  [${flag}] real{ ${a[i]} }  reverted{ ${b[i]} }`);
    if (a[i]!==b[i]) mismatches++;
  }
}
console.log("\n==== TOTAL DIFFERING TASKS between real and reverted:", mismatches, "====");
console.log(mismatches===0
  ? "=> Reverting entryExistsExact -> existsSync changes NO test outcome. The tests do NOT lock the fix."
  : "=> Some test outcome changed; a test DOES lock the fix.");
