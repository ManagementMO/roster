import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { template, type CombineTask, type Suite, type Verifier } from "./task.js";

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
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "roster-combine-"));
  const vars = { sandbox, runId: randomUUID().slice(0, 8) };
  const started = Date.now();
  let client: Client | null = null;
  try {
    for (const [rel, content] of Object.entries(task.setup?.files ?? {})) {
      const abs = path.join(sandbox, rel);
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
    await client.connect(transport);

    const args = template(task.invoke.args, vars);
    let result: Record<string, unknown>;
    try {
      result = (await client.callTool({ name: task.invoke.tool, arguments: args }, undefined, {
        timeout: task.timeoutMs,
      })) as Record<string, unknown>;
    } catch (err) {
      return finish(task, started, false, "invoke", err instanceof Error ? err.message : String(err));
    }
    if (result.isError === true) {
      return finish(task, started, false, "invoke", extractText(result).slice(0, 200));
    }

    for (const verifier of task.verify) {
      const failure = checkVerifier(verifier, sandbox, result, vars);
      if (failure) return finish(task, started, false, "verify", failure);
    }
    return finish(task, started, true, null, null);
  } catch (err) {
    return finish(task, started, false, "transport", err instanceof Error ? err.message : String(err));
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
  const resolvePath = (rel: string) => path.join(sandbox, template(rel, vars));
  switch (verifier.kind) {
    case "fileExists":
      return fs.existsSync(resolvePath(verifier.path)) ? null : `expected ${verifier.path} to exist`;
    case "fileAbsent":
      return fs.existsSync(resolvePath(verifier.path)) ? `expected ${verifier.path} to be absent` : null;
    case "fileEquals": {
      const p = resolvePath(verifier.path);
      if (!fs.existsSync(p)) return `expected ${verifier.path} to exist`;
      const actual = fs.readFileSync(p, "utf8");
      const expected = template(verifier.equals, vars);
      return actual === expected ? null : `content mismatch in ${verifier.path}`;
    }
    case "fileContains": {
      const p = resolvePath(verifier.path);
      if (!fs.existsSync(p)) return `expected ${verifier.path} to exist`;
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
