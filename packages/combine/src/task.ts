import { parse as parseYaml } from "yaml";

/**
 * Combine tasks are declarative and deterministic: seed a sandbox, invoke one
 * tool, verify the END STATE (files) or the result. No LLM judges anywhere.
 * `signed` is the provenance gate — only human-signed tasks may ever feed
 * named public scores (handoff §6.4). Everything ships signed: false.
 */
export type Verifier =
  | { kind: "fileEquals"; path: string; equals: string }
  | { kind: "fileContains"; path: string; contains: string }
  | { kind: "fileExists"; path: string }
  | { kind: "dirExists"; path: string }
  | { kind: "fileAbsent"; path: string }
  | { kind: "resultContains"; contains: string };

export interface CombineTask {
  id: string;
  category: string;
  mode: "sandboxed" | "readonly-live";
  signed: boolean;
  description?: string;
  setup?: { files?: Record<string, string> };
  invoke: { tool: string; args: Record<string, unknown> };
  verify: Verifier[];
  timeoutMs: number;
}

export interface Suite {
  suite: string;
  version: string;
  category: string;
  tasks: CombineTask[];
}

export function parseSuite(yamlContent: string): Suite {
  const raw = parseYaml(yamlContent);
  if (!isRecord(raw)) throw new Error("suite: not an object");
  const suite = requireString(raw, "suite");
  const version = requireString(raw, "version");
  const category = requireString(raw, "category");
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) throw new Error("suite: tasks[] required");

  const tasks = raw.tasks.map((t, i) => parseTask(t, category, i));
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) throw new Error("suite: duplicate task ids");
  return { suite, version, category, tasks };
}

function parseTask(raw: unknown, category: string, index: number): CombineTask {
  const where = `tasks[${index}]`;
  if (!isRecord(raw)) throw new Error(`${where}: task must be an object`);
  const id = requireString(raw, "id", where);
  const invoke = raw.invoke;
  if (!isRecord(invoke)) throw new Error(`${where}: invoke required`);
  const tool = requireString(invoke, "tool", `${where}.invoke`);
  const args = invoke.args;
  if (args !== undefined && !isRecord(args)) {
    throw new Error(`${where}.invoke: args must be an object`);
  }
  const setup = parseSetup(raw.setup, where);
  const verifyRaw = raw.verify;
  if (!Array.isArray(verifyRaw) || verifyRaw.length === 0) {
    throw new Error(`${where}: verify[] required — unverifiable tasks are not tasks`);
  }
  const verify = verifyRaw.map((entry, j) => parseVerifier(entry, `${where}.verify[${j}]`));
  const description = raw.description;
  if (description !== undefined && typeof description !== "string") {
    throw new Error(`${where}: description must be a string`);
  }
  const timeoutMs = raw.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
  ) {
    throw new Error(`${where}: timeoutMs must be a finite positive number`);
  }
  return {
    id,
    category,
    mode: raw.mode === "readonly-live" ? "readonly-live" : "sandboxed",
    signed: raw.signed === true,
    description,
    setup,
    invoke: { tool, args: args ?? {} },
    verify,
    timeoutMs: timeoutMs ?? 30_000,
  };
}

function parseSetup(raw: unknown, taskWhere: string): CombineTask["setup"] {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error(`${taskWhere}.setup: must be an object`);
  const files = raw.files;
  if (files === undefined) return {};
  if (!isRecord(files)) throw new Error(`${taskWhere}.setup.files: must be an object`);
  const parsedFiles: Record<string, string> = {};
  for (const [path, contents] of Object.entries(files)) {
    if (typeof contents !== "string") {
      throw new Error(`${taskWhere}.setup.files: ${path} must have string contents`);
    }
    parsedFiles[path] = contents;
  }
  return { files: parsedFiles };
}

function parseVerifier(raw: unknown, where: string): Verifier {
  if (!isRecord(raw)) throw new Error(`${where}: verifier must be an object`);
  const kind = raw.kind;
  if (!isVerifierKind(kind)) {
    throw new Error(`${where}: unknown kind`);
  }
  if (kind === "fileEquals") {
    return { kind, path: requireString(raw, "path", where), equals: requireString(raw, "equals", where) };
  }
  if (kind === "fileContains") {
    return { kind, path: requireString(raw, "path", where), contains: requireString(raw, "contains", where) };
  }
  if (kind === "fileExists" || kind === "dirExists" || kind === "fileAbsent") {
    return { kind, path: requireString(raw, "path", where) };
  }
  return { kind, contains: requireString(raw, "contains", where) };
}

function requireString(obj: Record<string, unknown>, key: string, where = "suite"): string {
  const value = obj[key];
  if (typeof value !== "string" || value === "") throw new Error(`${where}: ${key} required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isVerifierKind(value: unknown): value is Verifier["kind"] {
  return (
    value === "fileEquals" ||
    value === "fileContains" ||
    value === "fileExists" ||
    value === "dirExists" ||
    value === "fileAbsent" ||
    value === "resultContains"
  );
}

/** {{sandbox}} and {{run_id}} substitution, recursively through args. */
export function template<T>(value: T, vars: { sandbox: string; runId: string }): T {
  if (typeof value === "string") {
    return value
      .replaceAll("{{sandbox}}", vars.sandbox)
      .replaceAll("{{run_id}}", vars.runId) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => template(v, vars)) as unknown as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, template(v, vars)]),
    ) as unknown as T;
  }
  return value;
}
