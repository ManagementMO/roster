import { type ChildProcess, spawn } from "node:child_process";
import { getDefaultEnvironment, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

type ProcessGroupParameters = Pick<StdioServerParameters, "command" | "args" | "env"> & { stderr: "ignore" };

async function waitWithin(promise: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([promise, new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class ProcessGroupTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport["onmessage"];
  private readonly buffer = new ReadBuffer();
  private child?: ChildProcess;
  private exited?: Promise<void>;
  private closed?: Promise<void>;
  private closing?: Promise<void>;
  private started = false;

  constructor(private readonly parameters: ProcessGroupParameters) {}

  start(): Promise<void> {
    if (process.platform === "win32") return Promise.reject(new Error("process groups require POSIX"));
    if (this.started || this.closing) return Promise.reject(new Error("transport already started or closed"));
    this.started = true;
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.parameters.command, this.parameters.args ?? [], {
        env: { ...getDefaultEnvironment(), ...this.parameters.env },
        stdio: ["pipe", "pipe", this.parameters.stderr],
        detached: true,
        shell: false,
      });
      this.child = child;
      this.exited = new Promise<void>((done) => { child.once("exit", done); child.once("error", done); });
      this.closed = new Promise<void>((done) => { child.once("close", done); });
      child.once("spawn", resolve);
      child.on("error", (error) => {
        reject(error);
        this.report(error);
        void this.close().catch((failure: unknown) => this.report(failure));
      });
      child.once("exit", () => { void this.close().catch((error: unknown) => this.report(error)); });
      child.stdin?.on("error", (error) => this.report(error));
      child.stdout?.on("error", (error) => this.report(error));
      child.stdout?.on("data", (chunk: Buffer) => this.receive(chunk));
    });
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stdin = this.child?.stdin;
      if (!stdin || this.closing) {
        reject(new Error("Not connected"));
        return;
      }
      stdin.write(serializeMessage(message), (error) => { if (error) reject(error); else resolve(); });
    });
  }

  close(): Promise<void> {
    this.closing ??= Promise.resolve().then(async () => {
      const child = this.child;
      try {
        if (child) {
          if (!child.stdin?.destroyed) child.stdin?.end();
          if (this.exited) await waitWithin(this.exited, 2_000);
          if (this.signalGroup("SIGTERM")) {
            await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
            this.signalGroup("SIGKILL");
          }
          if (this.closed) await waitWithin(this.closed, 1_000);
        }
      } finally {
        child?.stdin?.destroy();
        child?.stdout?.destroy();
        this.child = undefined;
        this.buffer.clear();
        this.onclose?.();
      }
    });
    return this.closing;
  }

  private signalGroup(signal: NodeJS.Signals): boolean {
    const pid = this.child?.pid;
    if (!pid || pid <= 0) return false;
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
      throw error;
    }
  }

  private receive(chunk: Buffer): void {
    try {
      this.buffer.append(chunk);
    } catch (error) {
      this.child?.stdout?.pause();
      this.report(error);
      void this.close().catch((failure: unknown) => this.report(failure));
      return;
    }
    while (true) {
      try {
        const message = this.buffer.readMessage();
        if (message === null) return;
        this.onmessage?.(message);
      } catch (error) {
        this.report(error);
      }
    }
  }

  private report(error: unknown): void {
    this.onerror?.(error instanceof Error ? error : new Error(String(error)));
  }
}
