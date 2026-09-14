import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { embeddingWorkerSource } from "./embeddingWorker.js";

export type EmbeddingBackend = "native" | "wasm";
export type EmbeddingRuntimeStatus = { state: "ready"; backend: EmbeddingBackend } | { state: "missing" | "unavailable"; detail: string };

export function ownedEmbeddingRuntimeEntry(modulesDir: string): string | null {
  try {
    const root = fs.realpathSync(path.join(modulesDir, "@huggingface", "transformers"));
    const entry = fs.realpathSync(createRequire(path.join(modulesDir, "resolve-from.js")).resolve("@huggingface/transformers"));
    const relative = path.relative(root, entry);
    return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative) ? entry : null;
  } catch { return null; }
}

export function embeddingRuntimeEntries(fromFile: string, modulesDir: string | null): string[] {
  const entries: string[] = [];
  try { entries.push(createRequire(fromFile).resolve("@huggingface/transformers")); } catch { }
  const owned = modulesDir === null ? null : ownedEmbeddingRuntimeEntry(modulesDir);
  if (owned && !entries.includes(owned)) entries.push(owned);
  return entries;
}

export function probeEmbeddingRuntime(entries: readonly string[], timeout = 15_000): EmbeddingRuntimeStatus {
  if (!entries.length) return { state: "missing", detail: "embedding runtime is not installed" };
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "--eval", embeddingWorkerSource()], {
    input: JSON.stringify({ mode: "probe", entries }), encoding: "utf8", timeout, maxBuffer: 64 * 1024, windowsHide: true,
  });
  if (result.error || result.status !== 0) return { state: "unavailable", detail: (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT" ? "runtime readiness probe timed out" : "runtime readiness probe failed" };
  try {
    const status = JSON.parse(result.stdout) as EmbeddingRuntimeStatus;
    if (status.state === "ready" && ["native", "wasm"].includes(status.backend)) return status;
    if (status.state === "unavailable" && typeof status.detail === "string") return status;
  } catch { }
  return { state: "unavailable", detail: "runtime readiness probe returned an invalid response" };
}

function runtimeWorker(data: { mode: "probe" | "embed"; entries: readonly string[]; modelId?: string; cacheDir?: string }): Worker {
  const worker = new Worker(embeddingWorkerSource(), { eval: true, execArgv: [], workerData: data, stdout: true, stderr: true });
  worker.stdout.resume();
  worker.stderr.resume();
  return worker;
}

export function probeEmbeddingRuntimeAsync(entries: readonly string[], timeout = 15_000): Promise<EmbeddingRuntimeStatus> {
  if (!entries.length) return Promise.resolve({ state: "missing", detail: "embedding runtime is not installed" });
  const worker = runtimeWorker({ mode: "probe", entries });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: EmbeddingRuntimeStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().then(() => resolve(status));
    };
    const timer = setTimeout(() => finish({ state: "unavailable", detail: "runtime readiness probe timed out" }), timeout);
    worker.once("message", (status: EmbeddingRuntimeStatus) => {
      if (status?.state === "ready" && ["native", "wasm"].includes(status.backend)) finish(status);
      else finish({ state: "unavailable", detail: status?.state === "unavailable" ? status.detail : "runtime readiness probe failed" });
    });
    worker.once("error", () => finish({ state: "unavailable", detail: "runtime readiness probe failed" }));
    worker.once("exit", () => finish({ state: "unavailable", detail: "runtime readiness probe exited" }));
  });
}

export interface PortablePipeline {
  (texts: string[], options: { pooling: "mean"; normalize: boolean }): Promise<{ tolist(): number[][] }>;
  dispose(): Promise<void>;
}

export async function createWasmPipeline(entries: readonly string[], modelId: string, cacheDir: string): Promise<PortablePipeline> {
  const worker = runtimeWorker({ mode: "embed", entries, modelId, cacheDir });
  const pending = new Map<number, { resolve(rows: number[][]): void; reject(error: Error): void }>();
  let closed = false;
  let sequence = 0;
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const fail = (error: Error) => {
    closed = true;
    readyReject(error);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };
  worker.on("error", (error) => fail(new Error(`portable embedding worker failed (${(error as NodeJS.ErrnoException).code ?? error.name})`)));
  worker.on("exit", (code) => { if (!closed) fail(new Error(`portable embedding worker exited (${code})`)); });
  worker.on("message", (message: { kind?: string; id?: number; error?: string; rows?: number[][] }) => {
    if (message.kind === "ready") {
      if (message.error) fail(new Error(message.error));
      else readyResolve();
      return;
    }
    const waiter = pending.get(message.id!);
    if (!waiter) return;
    pending.delete(message.id!);
    if (message.error) waiter.reject(new Error(message.error));
    else if (Array.isArray(message.rows) && message.rows.every((row) => Array.isArray(row) && row.every(Number.isFinite))) waiter.resolve(message.rows);
    else waiter.reject(new Error("invalid portable embedding response"));
    if (!pending.size) worker.unref();
  });
  const startupTimer = setTimeout(() => { fail(new Error("portable model startup timed out")); void worker.terminate(); }, 10 * 60_000);
  try { await ready; }
  catch (error) { await worker.terminate(); throw error; }
  finally { clearTimeout(startupTimer); }
  worker.unref();
  const request = (action: "embed" | "dispose", texts?: string[]): Promise<number[][]> => {
    if (closed) return Promise.reject(new Error("portable embedding worker is closed"));
    const id = ++sequence;
    worker.ref();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, action, texts });
    });
  };
  const pipe: PortablePipeline = async (texts) => {
    const rows = await request("embed", texts);
    return { tolist: () => rows };
  };
  pipe.dispose = async () => {
    if (closed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([request("dispose"), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("portable disposal timed out")), 5000); })]);
    } finally {
      clearTimeout(timer);
      closed = true;
      await worker.terminate();
    }
  };
  return pipe;
}
