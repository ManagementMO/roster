import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { template, type CombineTask, type Suite, type Verifier } from "./task.js";

const CONNECT_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_LABEL = "connect timeout";

/**
 * A failure reduced to a STRUCTURAL code — never an error MESSAGE.
 *
 * `detail` is persisted into the published run artifact and printed to the
 * terminal, so anything that reaches it must be free of tool results, call
 * arguments, and local paths. An SDK error message fails that test: a -32602
 * routinely quotes the offending argument back, and a spawn failure carries the
 * full command path. The error's CODE carries the diagnosis without the content:
 * a JSON-RPC code (-32001 timed out, -32602 invalid params) or a Node errno
 * (ENOENT — the server command doesn't exist). Anything we can't classify
 * degrades to an opaque code rather than leaking the message (R5-04).
 *
 * The message is still available to whoever RUNS the suite — they can reproduce
 * it locally. It just never gets written down or published.
 */
function failureCode(err: unknown): string {
  if (err instanceof Error && err.message === CONNECT_TIMEOUT_LABEL) return "connect-timeout";
  const code: unknown = (err as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "number" && Number.isInteger(code)) return `mcp-error:${code}`;
  if (typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code)) return `system-error:${code}`;
  return "unknown-error";
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Contributed suites are untrusted: every sandbox-relative path must stay inside it. */
function containedPath(sandbox: string, rel: string): string {
  const resolved = path.resolve(sandbox, rel);
  if (resolved !== sandbox && !resolved.startsWith(sandbox + path.sep)) {
    throw new Error(`path escapes sandbox: ${rel}`);
  }
  return resolved;
}

export interface TargetServer {
  name: string;
  command: string;
  /** {{sandbox}} is substituted per task — e.g. the filesystem server's root dir. */
  args?: string[];
  env?: Record<string, string>;
}

export type FailureStage = "invoke" | "verify" | "transport";

export interface TaskResult {
  taskId: string;
  signed: boolean;
  pass: boolean;
  stage: FailureStage | null;
  detail: string | null;
  latencyMs: number;
}

export interface SuiteRunResult {
  server: string;
  suite: string;
  suiteVersion: string;
  category: string;
  results: TaskResult[];
}

/**
 * One fresh server process per task: no state bleed, deterministic reruns.
 * The runner never interprets content beyond the declared verifiers.
 */
export async function runSuite(suite: Suite, server: TargetServer): Promise<SuiteRunResult> {
  const results: TaskResult[] = [];
  for (const task of suite.tasks) {
    results.push(await runTask(task, server));
  }
  return {
    server: server.name,
    suite: suite.suite,
    suiteVersion: suite.version,
    category: suite.category,
    results,
  };
}

async function runTask(task: CombineTask, server: TargetServer): Promise<TaskResult> {
  // realpath matters: servers commonly resolve symlinks when validating
  // allowed roots (macOS /var → /private/var). An unresolved sandbox path
  // here produced 7 FALSE failures against the official filesystem server —
  // the exact misattribution class the signing protocol exists to catch.
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-combine-")));
  const vars = { sandbox, runId: randomUUID().slice(0, 8) };
  const started = Date.now();
  let client: Client | null = null;
  try {
    for (const [rel, content] of Object.entries(task.setup?.files ?? {})) {
      // Both the file name and its content are templated — a literal
      // "seeded-{{run_id}}.txt" on disk caused false ENOENT failures.
      const abs = containedPath(sandbox, template(rel, vars));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, template(content, vars));
    }

    client = new Client({ name: "roster-combine", version: "0.0.1" });
    const transport = new StdioClientTransport({
      command: server.command,
      args: (server.args ?? []).map((a) => template(a, vars)),
      env: server.env,
      stderr: "ignore",
    });
    // A server that spawns but never completes initialize must not hang the
    // suite — the Combine's whole job is probing servers that misbehave.
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, CONNECT_TIMEOUT_LABEL);

    const args = template(task.invoke.args, vars);
    let result: Record<string, unknown>;
    try {
      result = (await client.callTool({ name: task.invoke.tool, arguments: args }, undefined, {
        timeout: task.timeoutMs,
      })) as Record<string, unknown>;
    } catch (err) {
      return finish(task, started, false, "invoke", failureCode(err));
    }
    if (result.isError === true) {
      // NOT the result text. `detail` is persisted into lab-results.json and
      // printed to the terminal, and a tool's error content routinely echoes the
      // caller's arguments, file paths, or the very secret the call carried —
      // Round 5 (R5-04) walked a synthetic marker straight from a backend's
      // isError result into a published artifact. The binding law is absolute:
      // tool results are never persisted and never logged. What a run may record
      // is the STRUCTURAL fact that the tool reported failure.
      return finish(task, started, false, "invoke", "tool-returned-isError");
    }

    for (const verifier of task.verify) {
      // Verifier messages are built only from the task's own declared paths and
      // fixed strings (see checkVerifier) — suite-derived and already public, so
      // they carry no result text. They stay: they are the diagnosis.
      const failure = checkVerifier(verifier, sandbox, result, vars);
      if (failure) return finish(task, started, false, "verify", failure);
    }
    return finish(task, started, true, null, null);
  } catch (err) {
    return finish(task, started, false, "transport", failureCode(err));
  } finally {
    await client?.close().catch(() => undefined);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

function checkVerifier(
  verifier: Verifier,
  sandbox: string,
  result: Record<string, unknown>,
  vars: { sandbox: string; runId: string },
): string | null {
  const resolvePath = (rel: string) => containedPath(sandbox, template(rel, vars));
  switch (verifier.kind) {
    case "fileExists": {
      const p = resolvePath(verifier.path);
      if (!entryExistsExact(sandbox, p)) return `expected ${verifier.path} to exist`;
      return fs.statSync(p).isFile() ? null : `expected ${verifier.path} to be a regular file`;
    }
    case "dirExists": {
      const p = resolvePath(verifier.path);
      if (!entryExistsExact(sandbox, p)) return `expected directory ${verifier.path} to exist`;
      return fs.statSync(p).isDirectory() ? null : `expected ${verifier.path} to be a directory`;
    }
    case "fileAbsent":
      return fs.existsSync(resolvePath(verifier.path)) ? `expected ${verifier.path} to be absent` : null;
    case "fileEquals": {
      const p = resolvePath(verifier.path);
      if (!entryExistsExact(sandbox, p)) return `expected ${verifier.path} to exist`;
      const actual = fs.readFileSync(p, "utf8");
      const expected = template(verifier.equals, vars);
      return actual === expected ? null : `content mismatch in ${verifier.path}`;
    }
    case "fileContains": {
      const p = resolvePath(verifier.path);
      if (!entryExistsExact(sandbox, p)) return `expected ${verifier.path} to exist`;
      return fs.readFileSync(p, "utf8").includes(template(verifier.contains, vars))
        ? null
        : `missing expected content in ${verifier.path}`;
    }
    case "resultContains": {
      const expected = template(verifier.contains, vars);
      return extractText(result).includes(expected)
        ? null
        : `result text missing expected content`;
    }
  }
}

/**
 * Host-FS-agnostic existence: EVERY path component below the sandbox must
 * appear byte-for-byte (so case- AND unicode-normalization-sensitive) in its
 * parent directory listing. fs.existsSync alone false-passes on macOS/APFS
 * (case-insensitive, NFD-normalizing) for a case-flipped or NFD-variant name —
 * a certification hole invisible to case-sensitive Linux CI. Walking every
 * component (not just the basename) closes it for nested paths too: readdir
 * returns the real on-disk name and Array.includes compares by code unit, so
 * "Out" ≠ "out" and NFC ≠ NFD at any depth.
 */
function entryExistsExact(sandbox: string, abs: string): boolean {
  const rel = path.relative(sandbox, abs);
  if (rel === "" || rel === "." || rel.startsWith("..")) return fs.existsSync(abs);
  let dir = sandbox;
  for (const part of rel.split(path.sep)) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return false;
    }
    if (!entries.includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

function extractText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
    .join("\n");
}

function finish(
  task: CombineTask,
  started: number,
  pass: boolean,
  stage: FailureStage | null,
  detail: string | null,
): TaskResult {
  return { taskId: task.id, signed: task.signed, pass, stage, detail, latencyMs: Date.now() - started };
}
