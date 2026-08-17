#!/usr/bin/env node
/**
 * The gate that would have caught R6-03.
 *
 * Packs `@roster/cli` exactly as `npm publish` would, installs the tarball into
 * an empty project OUTSIDE this workspace (so nothing resolves through the pnpm
 * store or the monorepo's node_modules), and drives the real binary end to end.
 *
 * It fails if the published artifact declares an unpublished dependency, if the
 * binary cannot even be parsed (a duplicated shebang did exactly that), or if
 * the flagship init → sync → eject round-trip does not restore byte-for-byte.
 *
 * Usage: node scripts/verify-clean-install.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A minimal stdio MCP server, written with raw JSON-RPC so the probe needs no
 * dependency of its own. Roster must be able to spawn and proxy it.
 */
const FIXTURE_SERVER = `
let buffer = "";
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\\n");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1.0.0" },
      }});
    } else if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: [
        {
          name: "ping",
          description: "Reply with pong so the caller can prove the proxy works",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "write_file",
          description: "Write bytes to a path so a Combine verifier has an end state to check",
          inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
        },
      ]}});
    } else if (msg.method === "tools/call") {
      if (msg.params?.name === "write_file") {
        const { writeFileSync, mkdirSync } = await import("node:fs");
        const { dirname } = await import("node:path");
        const { path: p, content } = msg.params.arguments ?? {};
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, content);
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "wrote " + p }] } });
      } else {
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "pong" }] } });
      }
    } else if (msg.id !== undefined) {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  }
});
`;

/** Drive a stdio MCP server with raw JSON-RPC; resolves with its tool list. */
function speakMcp(command, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, stdio: ["pipe", "pipe", "pipe"] });
    const pending = new Map();
    let buffer = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`serve did not answer in time; stderr: ${stderr.slice(-400)}`));
    }, 60_000);
    const request = (id, method, params) =>
      new Promise((res) => {
        pending.set(id, res);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });

    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        const resolver = pending.get(msg.id);
        if (resolver) {
          pending.delete(msg.id);
          resolver(msg);
        }
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    (async () => {
      await request(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "clean-install-probe", version: "0" },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
      const listed = await request(2, "tools/list", {});
      const called = await request(3, "tools/call", {
        name: (listed.result.tools[0] ?? {}).name,
        arguments: {},
      });
      clearTimeout(timer);
      // Closing stdin must be enough: the published binary has to reap itself.
      child.stdin.end();
      const exited = await new Promise((res) => {
        const t = setTimeout(() => res("timeout"), 10_000);
        child.on("exit", (code) => {
          clearTimeout(t);
          res(code);
        });
      });
      if (exited === "timeout") child.kill("SIGKILL");
      resolve({ tools: listed.result.tools, called: called.result, exited, stderr });
    })().catch((err) => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(err);
    });
  });
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every workspace package that is NOT publishable. Derived from the workspace
 * itself rather than hardcoded, so adding a package cannot quietly escape these
 * checks. `@roster/cli` is the one publishable package; everything else is
 * `private` and must be inlined into it, never referenced from the tarball.
 */
function internalPackageNames() {
  const names = [];
  for (const dir of ["packages", "apps"]) {
    const base = path.join(repo, dir);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const manifestPath = path.join(base, entry, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.private === true) names.push(manifest.name);
    }
  }
  return names;
}
const INTERNAL = internalPackageNames();
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-clean-install-"));
const packDir = path.join(workdir, "pack");
const project = path.join(workdir, "project");
const fixtureHome = path.join(workdir, "home");
fs.mkdirSync(packDir);
fs.mkdirSync(project);
fs.mkdirSync(path.join(fixtureHome, ".cursor"), { recursive: true });

const steps = [];
const step = async (label, fn) => {
  try {
    const detail = await fn();
    steps.push(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    steps.push(`  FAIL  ${label} — ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

try {
  // 1. Pack through the real publish lifecycle (prepack builds + bundles).
  await step("pnpm pack produces a tarball", () => {
    run("pnpm", ["--filter", "@roster/cli", "pack", "--pack-destination", packDir], { cwd: repo });
    const [tarball] = fs.readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
    if (!tarball) throw new Error("no tarball produced");
    return tarball;
  });

  /**
   * npm and pnpm do NOT pack identically — npm ignores `publishConfig`
   * overrides for bin/main/exports while pnpm applies them. Testing only one
   * packer is how a completely broken `npm publish` passed every check. Whoever
   * runs the release must get the same artifact, so assert that directly.
   */
  await step("npm pack agrees with pnpm pack (packer parity)", () => {
    const npmDir = path.join(workdir, "npm-pack");
    fs.mkdirSync(npmDir, { recursive: true });
    run("npm", ["pack", "--pack-destination", npmDir], { cwd: path.join(repo, "packages/cli") });
    const npmTarball = path.join(npmDir, fs.readdirSync(npmDir).find((f) => f.endsWith(".tgz")));
    const pnpmTarball = path.join(packDir, fs.readdirSync(packDir).find((f) => f.endsWith(".tgz")));
    const listing = (t) => run("tar", ["-tzf", t]).trim().split("\n").sort().join("\n");
    if (listing(npmTarball) !== listing(pnpmTarball)) {
      throw new Error(
        `npm and pnpm ship different files:\n--- npm ---\n${listing(npmTarball)}\n--- pnpm ---\n${listing(pnpmTarball)}`,
      );
    }
    const manifestOf = (t) => JSON.parse(run("tar", ["-xzOf", t, "package/package.json"]));
    const shape = (m) => JSON.stringify({ bin: m.bin, main: m.main, exports: m.exports });
    if (shape(manifestOf(npmTarball)) !== shape(manifestOf(pnpmTarball))) {
      throw new Error(
        `npm and pnpm publish different entrypoints:\n  npm : ${shape(manifestOf(npmTarball))}\n  pnpm: ${shape(manifestOf(pnpmTarball))}`,
      );
    }
    return "identical files and entrypoints";
  });
  const tarball = path.join(packDir, fs.readdirSync(packDir).find((f) => f.endsWith(".tgz")));

  // 2. The published manifest must not reference anything unpublished — in ANY
  //    dependency field. devDependencies are published too, and pnpm rewrites
  //    `workspace:*` there as well, so a stale entry would advertise a version
  //    that does not exist on the registry.
  await step("published manifest declares only published dependencies", () => {
    const manifest = JSON.parse(run("tar", ["-xzOf", tarball, "package/package.json"]));
    const deps = Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    });
    const everyDeclared = Object.keys({ ...manifest.devDependencies }).concat(deps);
    const unpublished = everyDeclared.filter((name) => INTERNAL.includes(name));
    if (unpublished.length > 0) {
      throw new Error(`tarball declares unpublished packages: ${unpublished.join(", ")}`);
    }
    if (!manifest.bin?.roster) throw new Error("tarball declares no `roster` binary");
    /**
     * The manifest must point at files that are actually IN the tarball.
     *
     * This is not hypothetical: the package relied on `publishConfig` to
     * repoint bin/main/exports at `bundle/`, and **npm ignores those overrides
     * for those fields — only pnpm applies them**. A real `npm publish`
     * therefore shipped `bin: ./dist/bin.js`; npm auto-included that one file
     * because it is the bin target, and it imported siblings that `files`
     * never shipped. `npx -y @roster/cli` died with ERR_MODULE_NOT_FOUND on
     * the very first run, and no amount of `pnpm pack` testing could see it.
     */
    const shipped = new Set(
      run("tar", ["-tzf", tarball])
        .trim()
        .split("\n")
        .map((entry) => entry.replace(/^package\//, "")),
    );
    for (const [field, value] of [
      ["bin.roster", manifest.bin.roster],
      ["main", manifest.main],
      ["exports['.']", typeof manifest.exports?.["."] === "string" ? manifest.exports["."] : undefined],
    ]) {
      if (value === undefined) continue;
      const rel = String(value).replace(/^\.\//, "");
      if (!shipped.has(rel)) {
        throw new Error(`manifest ${field} points at "${value}", which the tarball does not contain`);
      }
    }
    // npm renders the package page from these. Without a README the listing is
    // blank; without repository/homepage/bugs it is a dead end with no source
    // link and nowhere to report a bug.
    const missing = ["description", "homepage", "repository", "bugs", "keywords", "license"].filter(
      (field) => manifest[field] === undefined,
    );
    if (missing.length > 0) {
      throw new Error(`published manifest is missing npm metadata: ${missing.join(", ")}`);
    }
    const files = run("tar", ["-tzf", tarball]);
    if (!/package\/README\.md/.test(files)) {
      throw new Error("tarball ships no README — the npm package page would be blank");
    }
    if (!/package\/LICENSE/.test(files)) {
      throw new Error("tarball ships no LICENSE — an MIT package with no licence file");
    }
    // A SCOPED package is restricted by default: without this, the first real
    // `npm publish` dies with "402 Payment Required — You must sign up for
    // private packages". A local test registry that allows anonymous publish
    // will never reveal it.
    if (manifest.name.startsWith("@") && manifest.publishConfig?.access !== "public") {
      throw new Error(
        `${manifest.name} is scoped but does not set publishConfig.access="public"; npm would publish it as private (402)`,
      );
    }
    return `${deps.length} deps, bin → ${manifest.bin.roster}, README + metadata present`;
  });

  // 3. @roster/cli is the ONLY thing a user should ever see. No internal
  //    package name may survive anywhere in the shipped bytes.
  await step("no internal package name appears anywhere in the tarball", () => {
    const files = run("tar", ["-tzf", tarball]).trim().split("\n");
    const offenders = [];
    for (const entry of files) {
      if (entry.endsWith("/")) continue;
      const contents = run("tar", ["-xzOf", tarball, entry]);
      for (const name of INTERNAL) {
        if (contents.includes(name)) offenders.push(`${entry} (${name})`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(`internal package name leaked into: ${offenders.join(", ")}`);
    }
    return `${files.length} files clean of ${INTERNAL.length} internal names`;
  });

  // 4. Install into an empty project with no access to the workspace.
  await step("npm install of the tarball succeeds in an empty project", () => {
    run("npm", ["init", "-y"], { cwd: project });
    run("npm", ["install", tarball, "--omit=optional", "--no-audit", "--no-fund"], { cwd: project });
    const leaked = INTERNAL.filter((name) =>
      fs.existsSync(path.join(project, "node_modules", name)),
    );
    if (leaked.length > 0) {
      throw new Error(`internal packages leaked into the install: ${leaked.join(", ")}`);
    }
    return "optional deps omitted (the minimal install)";
  });

  const bin = path.join(project, "node_modules/.bin/roster");
  const env = {
    ...process.env,
    ROSTER_TEST_HOME: fixtureHome,
    ROSTER_HOME: path.join(fixtureHome, ".roster"),
    ROSTER_NO_FETCH: "1",
  };
  const roster = (...args) => run(bin, args, { cwd: project, env });

  // 5. The binary must actually parse and run.
  await step("roster --help runs from the published artifact", () => {
    const out = roster("--help");
    if (!out.includes("roster init")) throw new Error("help text missing");
    return "help rendered";
  });

  const clientConfig = path.join(fixtureHome, ".cursor", "mcp.json");
  fs.writeFileSync(
    clientConfig,
    `${JSON.stringify({ mcpServers: { demo: { command: "echo", args: ["hi"] } } }, null, 2)}\n`,
  );
  const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const before = sha(clientConfig);

  await step("roster init prints the Day-0 receipt", () => {
    const out = roster("init");
    if (!out.includes("Day-0 receipt")) throw new Error("receipt missing from init output");
    return "receipt printed";
  });

  await step("roster sync → eject restores byte-for-byte", () => {
    roster("sync", "--client", "cursor");
    const synced = JSON.parse(fs.readFileSync(clientConfig, "utf8"));
    if (Object.keys(synced.mcpServers).length !== 1) throw new Error("sync did not install one entry");
    roster("eject", "--client", "cursor");
    if (sha(clientConfig) !== before) throw new Error("eject did not restore the original bytes");
    return "round-trip identical";
  });

  await step("roster telemetry is OFF by default", () => {
    const out = roster("telemetry", "status");
    if (!/OFF/.test(out)) throw new Error(`unexpected telemetry status: ${out.trim()}`);
    return "off";
  });

  /**
   * The entry `sync` writes into a client config is computed from
   * `import.meta.url` (ourBinPath). Bundling MOVES that file, so a layout change
   * can silently write a path that does not exist — the client would then fail
   * to start Roster at all, and only on a real install would anyone notice.
   */
  let syncedEntry;
  await step("the entry sync writes points at a file that exists", () => {
    roster("sync", "--client", "cursor");
    const config = JSON.parse(fs.readFileSync(clientConfig, "utf8"));
    syncedEntry = config.mcpServers.roster;
    if (!syncedEntry) throw new Error("no roster entry was written");
    const target = syncedEntry.args?.[0];
    if (syncedEntry.command !== "roster" && !fs.existsSync(target)) {
      throw new Error(`sync wrote a non-existent binary path: ${target}`);
    }
    return syncedEntry.command === "roster" ? "global `roster`" : path.basename(target ?? "");
  });

  // Give the router a real backend to proxy, using the entry the client got.
  const fixtureServer = path.join(project, "fixture-server.mjs");
  fs.writeFileSync(fixtureServer, FIXTURE_SERVER);
  const rosterJson = path.join(fixtureHome, ".roster", "roster.json");
  const config = JSON.parse(fs.readFileSync(rosterJson, "utf8"));
  config.servers = {
    fixture: { command: process.execPath, args: [fixtureServer], importedFrom: ["probe"] },
  };
  config.mode = "transparent";
  fs.writeFileSync(rosterJson, JSON.stringify(config, null, 2), { mode: 0o600 });

  await step("the published binary boots as an MCP server and proxies a backend", async () => {
    const result = await speakMcp(
      syncedEntry.command === "roster" ? bin : syncedEntry.command,
      syncedEntry.command === "roster" ? ["serve"] : syncedEntry.args,
      env,
      project,
    );
    const names = result.tools.map((t) => t.name);
    if (!names.includes("fixture__ping")) {
      throw new Error(`backend tool missing from the proxy; got ${JSON.stringify(names)}`);
    }
    const text = (result.called.content ?? []).map((c) => c.text).join("");
    if (!text.includes("pong")) throw new Error(`proxied call returned ${JSON.stringify(text)}`);
    if (result.exited === "timeout") {
      throw new Error("serve did not exit after stdin EOF (orphaned backend risk)");
    }
    return `proxied ${names.join(", ")} · call → "${text}" · exit ${result.exited}`;
  });

  roster("eject", "--client", "cursor");

  /**
   * Every remaining subcommand, so "the CLI is one package" means the WHOLE CLI
   * and not just the paths this script happened to touch first. If a future
   * command needs a workspace package that is not inlined, or an asset that
   * `files` does not ship, it fails here rather than in a user's terminal.
   */
  await step("roster receipt re-prints the audit from the published artifact", () => {
    const out = roster("receipt");
    if (!out.includes("Day-0 receipt")) throw new Error("receipt did not render");
    return "rendered";
  });

  await step("roster unquarantine reaches the coach database", () => {
    const out = roster("unquarantine", "fixture__ping");
    if (!/cleared quarantine/.test(out)) throw new Error(`unexpected output: ${out.trim()}`);
    return "coach reachable";
  });

  await step("roster combine runs a suite and writes a signed-separated artifact", () => {
    const suite = path.join(project, "smoke-suite.yaml");
    fs.writeFileSync(
      suite,
      [
        "suite: clean-install-smoke",
        'version: "0.1.0"',
        "category: filesystem",
        "tasks:",
        "  - id: smoke.write.v1",
        "    description: write a file and verify its exact bytes",
        "    invoke:",
        '      tool: write_file',
        '      args: { path: "{{sandbox}}/hello-{{run_id}}.txt", content: "roster {{run_id}}" }',
        "    verify:",
        '      - { kind: fileEquals, path: "hello-{{run_id}}.txt", equals: "roster {{run_id}}" }',
        "",
      ].join("\n"),
    );
    const out = path.join(workdir, "combine.json");
    roster("combine", "run", suite, "--name", "smoke", "--out", out, "--", process.execPath, fixtureServer);
    const artifact = JSON.parse(fs.readFileSync(out, "utf8"));
    const summary = artifact.runs[0].summary;
    if (summary.n !== 1 || summary.passes !== 1) {
      throw new Error(`combine did not pass its task: ${JSON.stringify(summary)}`);
    }
    // The signing law must hold in the published binary too: an unsigned task
    // may produce a Wilson bound, but never a SIGNED one.
    if (summary.signedN !== 0 || summary.signedWilsonLb !== 0) {
      throw new Error(`unsigned tasks leaked into the signed score: ${JSON.stringify(summary)}`);
    }
    return `${summary.passes}/${summary.n} passed · wilsonLb ${summary.wilsonLb.toFixed(3)} · signed ${summary.signedN}`;
  });

  process.stdout.write(`${steps.join("\n")}\n\nclean external install: OK\n`);
} catch (error) {
  process.stdout.write(`${steps.join("\n")}\n`);
  const detail = error?.stderr ? `\n${error.stderr}` : "";
  process.stderr.write(`\nclean external install FAILED${detail}\n`);
  process.exitCode = 1;
} finally {
  fs.rmSync(workdir, { recursive: true, force: true });
}
