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

const VERIFIER_KINDS = new Set(["fileEquals", "fileContains", "fileExists", "fileAbsent", "resultContains"]);

export function parseSuite(yamlContent: string): Suite {
  const raw = parseYaml(yamlContent) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("suite: not an object");
  const suite = requireString(raw, "suite");
  const version = requireString(raw, "version");
  const category = requireString(raw, "category");
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) throw new Error("suite: tasks[] required");

  const tasks = raw.tasks.map((t, i) => parseTask(t as Record<string, unknown>, category, i));
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) throw new Error("suite: duplicate task ids");
  return { suite, version, category, tasks };
}

function parseTask(raw: Record<string, unknown>, category: string, index: number): CombineTask {
  const where = `tasks[${index}]`;
  const id = requireString(raw, "id", where);
  const invoke = raw.invoke as Record<string, unknown> | undefined;
  if (!invoke || typeof invoke !== "object") throw new Error(`${where}: invoke required`);
  const tool = requireString(invoke, "tool", `${where}.invoke`);
  const verifyRaw = raw.verify;
  if (!Array.isArray(verifyRaw) || verifyRaw.length === 0) {
    throw new Error(`${where}: verify[] required — unverifiable tasks are not tasks`);
  }
  const verify = verifyRaw.map((v, j) => {
    const entry = v as Record<string, unknown>;
    const kind = entry.kind;
    if (typeof kind !== "string" || !VERIFIER_KINDS.has(kind)) {
      throw new Error(`${where}.verify[${j}]: unknown kind ${String(kind)}`);
    }
    const requireField = (field: string): void => {
      if (typeof entry[field] !== "string" || entry[field] === "") {
        throw new Error(`${where}.verify[${j}]: ${kind} requires string ${field}`);
      }
    };
    if (kind === "fileEquals") {
      requireField("path");
      requireField("equals");
    } else if (kind === "fileContains") {
      requireField("path");
      requireField("contains");
    } else if (kind === "fileExists" || kind === "fileAbsent") {
      requireField("path");
    } else if (kind === "resultContains") {
      requireField("contains");
    }
    return v as Verifier;
  });
  return {
    id,
    category,
    mode: raw.mode === "readonly-live" ? "readonly-live" : "sandboxed",
    signed: raw.signed === true,
    description: typeof raw.description === "string" ? raw.description : undefined,
    setup: raw.setup as CombineTask["setup"],
    invoke: { tool, args: (invoke.args as Record<string, unknown>) ?? {} },
    verify,
    timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : 30_000,
  };
}

function requireString(obj: Record<string, unknown>, key: string, where = "suite"): string {
  const value = obj[key];
  if (typeof value !== "string" || value === "") throw new Error(`${where}: ${key} required`);
  return value;
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
