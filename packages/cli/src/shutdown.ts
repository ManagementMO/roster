/**
 * The ONE graceful-shutdown path for `roster serve`.
 *
 * Lives in its own module deliberately (lab experiment E4). The behaviour is
 * only exercised end-to-end by POSIX subprocess tests that `skipIf(win32)`, so
 * on Windows the sole thing standing between us and the original orphaned-child
 * bug was that deleting the call site left an unused local function — which
 * Biome reports. Moving it here keeps that static guard (deleting the call site
 * now leaves an unused IMPORT, still a lint error) *and* allows the fast,
 * platform-neutral tests in shutdown.test.ts to drive every branch on every OS.
 *
 * On the reviewed base `serve` connected the transport and returned, leaving
 * `manager` and `store` as unreachable locals: when the client terminated the
 * process — stdin EOF on disconnect, SIGINT, SIGTERM — the spawned backend
 * children were orphaned and the coach DB was never closed.
 */

/** Structural targets, so tests need no real BackendManager/CoachStore/Server. */
export interface ShutdownTargets {
  /** Closes every backend child under its own bounded timeout. */
  manager: { close(): Promise<void> };
  store: { close(): void };
  server: { onclose?: (() => void) | undefined };
}

export interface ShutdownOptions {
  /** Seam for tests; production terminates the process. */
  exit?: (code: number) => void;
  /** Seam for tests; production writes to stderr (never tool args/results). */
  onMessage?: (message: string) => void;
}

/**
 * Idempotent: the first trigger wins and the rest are no-ops, so racing
 * triggers (EOF + a signal) cannot double-close or hang. Signal listeners are
 * one-shot and removed once shutdown starts. Nothing here logs tool args,
 * results, or prompts.
 */
export function installGracefulShutdown(
  targets: ShutdownTargets,
  options: ShutdownOptions = {},
): void {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const emit = options.onMessage ?? ((message: string) => void process.stderr.write(message));
  const { manager, store, server } = targets;

  let started = false;
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  /**
   * The signal name is bound from OUR loop, not read from the event payload.
   * Node passes it on a real signal, but anything that re-emits the event
   * without it (a supervisor, a test, a wrapper) previously made `sig`
   * undefined — and `sig === "SIGINT" ? 130 : 143` then reported the wrong
   * exit status for an interrupt. Closing over the name cannot degrade.
   */
  const handlers = new Map<NodeJS.Signals, () => void>();
  const onEof = (): void => {
    void shutdown("client disconnected (stdin EOF)", 0);
  };
  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (started) return;
    started = true;
    for (const [sig, handler] of handlers) process.removeListener(sig, handler);
    process.stdin.removeListener("end", onEof);
    process.stdin.removeListener("close", onEof);
    emit(`roster: shutting down (${reason})\n`);
    try {
      await manager.close();
    } catch {
      /* bounded close already swallows per-backend errors */
    }
    try {
      store.close();
    } catch {
      /* DB may already be closing */
    }
    exit(exitCode);
  };
  for (const sig of signals) {
    // 128 + signal number is the conventional exit status for a signal.
    const handler = (): void => void shutdown(sig, sig === "SIGINT" ? 130 : 143);
    handlers.set(sig, handler);
    process.once(sig, handler);
  }
  // The SDK stdio transport listens only for stdin 'data'/'error' — it never
  // reacts to EOF — so a client disconnect would otherwise leave `serve` and its
  // backend children alive (the orphan bug). Detect the EOF ourselves; the
  // transport's own 'data' listener keeps stdin flowing so 'end' fires on close.
  process.stdin.on("end", onEof);
  process.stdin.on("close", onEof);
  // Also honor an explicit transport/server close (defensive; e.g. a protocol
  // error tears the transport down).
  server.onclose = () => {
    void shutdown("transport closed", 0);
  };
}
