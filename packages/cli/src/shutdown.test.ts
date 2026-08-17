import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installGracefulShutdown, type ShutdownTargets } from "./shutdown.js";

/**
 * These run on EVERY platform, including Windows.
 *
 * serve.test.ts drives the real thing through a spawned backend and POSIX
 * signals, which is the stronger evidence — but it `skipIf(win32)`s, so the
 * whole shutdown contract was unverified on the one platform where the
 * production listeners behave differently (lab experiment E4). Driving the
 * installed listeners directly covers idempotence, listener cleanup, exit
 * codes, and error tolerance without spawning anything.
 */
function harness(overrides: Partial<ShutdownTargets> = {}) {
  const calls: string[] = [];
  const exits: number[] = [];
  const targets: ShutdownTargets = {
    manager: {
      close: async () => {
        calls.push("manager.close");
      },
    },
    store: {
      close: () => {
        calls.push("store.close");
      },
    },
    server: {},
    ...overrides,
  };
  installGracefulShutdown(targets, {
    exit: (code) => exits.push(code),
    onMessage: (message) => calls.push(message.trim()),
  });
  return { calls, exits, targets };
}

/** Let the async shutdown chain settle without arbitrary sleeps. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const signalListeners = () =>
  process.listenerCount("SIGINT") + process.listenerCount("SIGTERM");
const stdinListeners = () =>
  process.stdin.listenerCount("end") + process.stdin.listenerCount("close");

let baselineSignals = 0;
let baselineStdin = 0;
beforeEach(() => {
  baselineSignals = signalListeners();
  baselineStdin = stdinListeners();
});

afterEach(() => {
  // Any listener a failing test leaked would silently corrupt its neighbours.
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.stdin.removeAllListeners("end");
  process.stdin.removeAllListeners("close");
});

describe("graceful shutdown (platform-neutral)", () => {
  it("closes backends then the store, and exits 143 on SIGTERM", async () => {
    const { calls, exits } = harness();
    process.emit("SIGTERM", "SIGTERM"); // as Node delivers a real signal
    await settle();
    expect(calls).toEqual([
      "roster: shutting down (SIGTERM)",
      "manager.close",
      "store.close",
    ]);
    expect(exits).toEqual([143]);
  });

  /**
   * Deliberately emitted WITHOUT the signal-name payload. The handler used to
   * read the name from the event, so any re-emit that omitted it fell through
   * to the SIGTERM branch and reported 143 for an interrupt; the name is now
   * bound from the registration loop instead.
   */
  it("exits 130 on SIGINT even when the event carries no signal name", async () => {
    const { calls, exits } = harness();
    process.emit("SIGINT");
    await settle();
    expect(calls[0]).toBe("roster: shutting down (SIGINT)");
    expect(exits).toEqual([130]);
  });

  it("exits 0 when the client disconnects (stdin EOF)", async () => {
    const { calls, exits } = harness();
    process.stdin.emit("end");
    await settle();
    expect(calls[0]).toBe("roster: shutting down (client disconnected (stdin EOF))");
    expect(exits).toEqual([0]);
  });

  it("exits 0 when the transport closes underneath it", async () => {
    const { calls, exits, targets } = harness();
    targets.server.onclose?.();
    await settle();
    expect(calls[0]).toBe("roster: shutting down (transport closed)");
    expect(exits).toEqual([0]);
  });

  it("is idempotent: racing triggers close the backends exactly once", async () => {
    const { calls, exits, targets } = harness();
    process.emit("SIGTERM", "SIGTERM");
    process.emit("SIGTERM", "SIGTERM");
    process.emit("SIGINT");
    process.stdin.emit("end");
    targets.server.onclose?.();
    await settle();
    expect(calls.filter((c) => c === "manager.close")).toHaveLength(1);
    expect(calls.filter((c) => c === "store.close")).toHaveLength(1);
    expect(exits).toEqual([143]); // the FIRST trigger wins
  });

  it("removes every listener it installed once shutdown starts", async () => {
    harness();
    expect(signalListeners()).toBe(baselineSignals + 2);
    expect(stdinListeners()).toBe(baselineStdin + 2);
    process.emit("SIGTERM", "SIGTERM");
    await settle();
    expect(signalListeners()).toBe(baselineSignals);
    expect(stdinListeners()).toBe(baselineStdin);
  });

  it("still closes the store and exits when a backend refuses to close", async () => {
    const { calls, exits } = harness({
      manager: {
        close: async () => {
          throw new Error("backend wedged");
        },
      },
    });
    process.emit("SIGTERM", "SIGTERM");
    await settle();
    expect(calls).toContain("store.close"); // the DB is never left open
    expect(exits).toEqual([143]);
  });

  it("still exits when closing the database throws", async () => {
    const { exits } = harness({
      store: {
        close: () => {
          throw new Error("already closing");
        },
      },
    });
    process.emit("SIGTERM", "SIGTERM");
    await settle();
    expect(exits).toEqual([143]);
  });
});
