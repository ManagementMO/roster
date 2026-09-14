async function embeddingWorkerMain(requireModule: NodeRequire): Promise<void> {
  const fs = requireModule("node:fs") as typeof import("node:fs");
  const path = requireModule("node:path") as typeof import("node:path");
  const { createRequire } = requireModule("node:module") as typeof import("node:module");
  const { pathToFileURL } = requireModule("node:url") as typeof import("node:url");
  const { parentPort, workerData } = requireModule("node:worker_threads") as typeof import("node:worker_threads");
  const data = (parentPort ? workerData : JSON.parse(fs.readFileSync(0, "utf8"))) as {
    mode: "probe" | "embed";
    entries: string[];
    modelId?: string;
    cacheDir?: string;
  };
  type Session = { run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>>; release(): Promise<void> };
  type Ort = {
    env: { wasm: { numThreads?: number; proxy?: boolean; wasmPaths?: unknown } };
    Tensor: new (type: string, values: Float32Array, dims: number[]) => unknown;
    InferenceSession: { create(model: Uint8Array, options: Record<string, unknown>): Promise<Session> };
  };
  type Pipeline = ((texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>) & { dispose?: () => Promise<void> };
  type Transformers = { pipeline?: (task: string, model: string, options: Record<string, unknown>) => Promise<Pipeline>; env: Record<string, unknown> };
  const probeModel = Buffer.from("CAg6XAoZCgV2YWx1ZRIGcmVzdWx0IghJZGVudGl0eRIUcm9zdGVyX3J1bnRpbWVfcHJvYmVaEwoFdmFsdWUSCgoICAESBAoCCAFiFAoGcmVzdWx0EgoKCAgBEgQKAggBQgIQDQ==", "base64");
  const errorCode = (error: unknown): string => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "string" ? code : error instanceof Error ? error.name : "ERROR";
  };
  const importModule = async (entry: string) => {
    const loaded = requireModule(entry);
    return loaded.default ?? loaded;
  };
  const checkInterface = (tf: Transformers): void => {
    if (typeof tf.pipeline !== "function") throw Object.assign(new Error("invalid inference interface"), { code: "INVALID_TRANSFORMERS_API" });
  };
  const checkSession = async (ort: Ort, backend: "cpu" | "wasm"): Promise<void> => {
    const session = await ort.InferenceSession.create(probeModel, { executionProviders: [backend] });
    try {
      const result = await session.run({ value: new ort.Tensor("float32", Float32Array.of(1.25), [1]) });
      if (result.result?.data[0] !== 1.25) throw Object.assign(new Error("runtime probe result mismatch"), { code: "INVALID_PROBE_RESULT" });
    } finally {
      await session.release();
    }
  };
  const loadNative = async (entry: string): Promise<void> => {
    checkInterface(await importModule(entry) as Transformers);
    const ort = await importModule(createRequire(entry).resolve("onnxruntime-node")) as Ort;
    await checkSession(ort, "cpu");
  };
  const loadWasm = async (entry: string): Promise<Transformers> => {
    const ortEntry = createRequire(entry).resolve("onnxruntime-web");
    const directory = path.dirname(ortEntry);
    const mjs = path.join(directory, "ort-wasm-simd-threaded.mjs");
    const wasm = path.join(directory, "ort-wasm-simd-threaded.wasm");
    const web = path.join(path.dirname(entry), "transformers.web.js");
    for (const file of [mjs, wasm, web]) if (!fs.lstatSync(file).isFile()) throw Object.assign(new Error("runtime asset is not a regular file"), { code: "INVALID_RUNTIME_ASSET" });
    const ort = await importModule(ortEntry) as Ort;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = { mjs: pathToFileURL(mjs).href, wasm: pathToFileURL(wasm).href };
    (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("onnxruntime")] = {
      ...ort,
      InferenceSession: { create: (model: Uint8Array, options: Record<string, unknown>) => ort.InferenceSession.create(model, { ...options, executionProviders: ["wasm"] }) },
    };
    const tf = await importModule(web) as Transformers;
    checkInterface(tf);
    tf.env.useWasmCache = false;
    await checkSession(ort, "wasm");
    return tf;
  };
  const send = (message: unknown): void => {
    if (parentPort) parentPort.postMessage(message);
    else process.stdout.write(JSON.stringify(message));
  };
  let nativeError = "NOT_INSTALLED";
  let wasmError = "NOT_INSTALLED";
  if (data.mode === "probe") {
    for (const entry of data.entries) {
      try {
        await loadNative(entry);
        send({ state: "ready", backend: "native" });
        parentPort?.close();
        return;
      } catch (error) { nativeError = errorCode(error); }
    }
    for (const entry of [...data.entries].reverse()) {
      try {
        await loadWasm(entry);
        send({ state: "ready", backend: "wasm" });
        parentPort?.close();
        return;
      } catch (error) { wasmError = errorCode(error); }
    }
    send({ state: data.entries.length ? "unavailable" : "missing", detail: `native: ${nativeError}; WASM: ${wasmError}` });
    parentPort?.close();
    return;
  }
  if (!parentPort || !data.modelId || !data.cacheDir) throw new Error("invalid embedding worker configuration");
  const { createHash, randomUUID } = requireModule("node:crypto") as typeof import("node:crypto");
  const maxArtifactBytes = 1024 * 1024 * 1024;
  let cacheRoot: string | undefined;
  const cacheFile = (key: string): string => {
    if (!cacheRoot) {
      const base = path.resolve(data.cacheDir!, "../..");
      if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true, mode: 0o700 });
      let directory = fs.realpathSync(base);
      for (const segment of ["cache", "wasm"]) {
        directory = path.join(directory, segment);
        let stat: ReturnType<typeof fs.lstatSync>;
        try { stat = fs.lstatSync(directory); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
          stat = fs.lstatSync(directory);
        }
        if (!stat.isDirectory()) throw Object.assign(new Error("unsafe model cache directory"), { code: "UNSAFE_MODEL_CACHE" });
        if (process.platform !== "win32" && (Number(stat.mode) & 0o077)) fs.chmodSync(directory, 0o700);
      }
      cacheRoot = directory;
    }
    return path.join(cacheRoot, createHash("sha256").update(key).digest("hex"));
  };
  const cache = {
    async match(key: string): Promise<Response | undefined> {
      const file = cacheFile(key);
      let fd: number;
      let before: import("node:fs").BigIntStats;
      try {
        before = fs.lstatSync(file, { bigint: true });
        if (!before.isFile() || before.nlink !== 1n) throw Object.assign(new Error("unsafe model cache entry"), { code: "UNSAFE_MODEL_CACHE" });
        fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
      } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
      try {
        const stat = fs.fstatSync(fd, { bigint: true });
        const named = fs.lstatSync(file, { bigint: true });
        if (!stat.isFile() || !named.isFile() || stat.nlink !== 1n || named.nlink !== 1n || stat.size > BigInt(maxArtifactBytes) || before.dev !== stat.dev || before.ino !== stat.ino || before.birthtimeNs !== stat.birthtimeNs || named.dev !== stat.dev || named.ino !== stat.ino || named.birthtimeNs !== stat.birthtimeNs) throw Object.assign(new Error("unsafe model cache entry"), { code: "UNSAFE_MODEL_CACHE" });
        const bytes = fs.readFileSync(fd);
        return new Response(new Uint8Array(bytes), { headers: { "content-length": String(bytes.length) } });
      } finally { fs.closeSync(fd); }
    },
    async put(key: string, response: Response): Promise<void> {
      if (Number(response.headers.get("content-length")) > maxArtifactBytes) throw new Error("model cache entry exceeds size limit");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > maxArtifactBytes) throw new Error("model cache entry exceeds size limit");
      const file = cacheFile(key);
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.nlink !== 1) throw Object.assign(new Error("unsafe model cache entry"), { code: "UNSAFE_MODEL_CACHE" });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
        fs.renameSync(temporary, file);
      } finally { fs.rmSync(temporary, { force: true }); }
    },
  };
  let tf: Transformers | undefined;
  for (const entry of [...data.entries].reverse()) {
    try { tf = await loadWasm(entry); break; } catch (error) { wasmError = errorCode(error); }
  }
  if (!tf) { send({ kind: "ready", error: `portable runtime unavailable (${wasmError})` }); parentPort.close(); return; }
  tf.env.allowLocalModels = false;
  tf.env.useBrowserCache = false;
  tf.env.useFSCache = false;
  tf.env.useWasmCache = false;
  tf.env.useCustomCache = true;
  tf.env.customCache = cache;
  const pipe = await tf.pipeline!("feature-extraction", data.modelId, { dtype: "q8", device: "auto" });
  send({ kind: "ready" });
  let queue = Promise.resolve();
  parentPort.on("message", (message: { id: number; action: "embed" | "dispose"; texts?: string[] }) => {
    queue = queue.then(async () => {
      if (message.action === "dispose") {
        await pipe.dispose?.();
        send({ id: message.id, rows: [] });
        parentPort.close();
      } else {
        if (!Array.isArray(message.texts) || !message.texts.every((text) => typeof text === "string")) throw new Error("invalid embedding request");
        const rows = (await pipe(message.texts, { pooling: "mean", normalize: true })).tolist();
        if (!rows.every((row) => row.every(Number.isFinite))) throw new Error("non-finite embedding output");
        send({ id: message.id, rows });
      }
    }).catch((error) => { send({ id: message.id, error: `portable inference failed (${errorCode(error)})` }); });
  });
}

export function embeddingWorkerSource(): string {
  return `(${embeddingWorkerMain.toString()})(require);`;
}
