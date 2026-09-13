export const repository = "https://github.com/ManagementMO/roster";
export const packageName = "@npmmo/roster";
export const executable = "roster";
export const release = {
  published: true,
  version: "0.0.2",
  checked: "2026-09-13",
  revision: "c930932c2bec9a0db4faa6039d87ef9f22946c3f",
} as const;

export const description = "The local tool router for AI agents. Connect MCP servers and approved skills, learn from on-device outcomes, and keep your toolkit under your control.";
export const source = (file: string) => `${repository}/blob/${release.revision}/${file}`;
export const statusLabel = release.published ? `v${release.version} available` : "Open source. Pre-release.";

export type CommandPlatform = "posix" | "windows";

export function commandsFor(state: { published: boolean; version: string; revision: string }, platform: CommandPlatform = "posix") {
  const suffix = platform === "windows" ? ".cmd" : "";
  const spec = `${packageName}@${state.version}`;
  const prefix = state.published ? `npx${suffix} --yes ${spec}` : "node packages/cli/dist/bin.js";
  return {
    prepare: state.published
      ? `${prefix} init --no-dense`
      : `git clone ${repository}.git roster-source\ncd roster-source\ngit checkout ${state.revision}\npnpm${suffix} install --frozen-lockfile\npnpm${suffix} build`,
    globalInstall: `npm${suffix} install --global ${spec}`,
    help: `${prefix} --help`,
    init: `${prefix} init --no-dense`,
    receipt: `${prefix} receipt`,
    sync: `${prefix} sync --client cursor`,
    eject: `${prefix} eject --client cursor`,
    serve: `${prefix} serve`,
    five: `${prefix} serve --five`,
    transparent: `${prefix} serve --transparent`,
    telemetry: `${prefix} telemetry status`,
    denseStatus: `${prefix} dense status`,
    denseEnable: `${prefix} dense enable`,
    unquarantine: `${prefix} unquarantine filesystem__read_text_file`,
    combine: `${prefix} combine run suites/filesystem/tasks.yaml --name local-fixture -- node packages/combine/test/fixtures/fake-fs-server.mjs "{{sandbox}}"`,
  };
}

export const commands = commandsFor(release);
export const futureInstall = `npm install --global ${packageName}`;

export const setupPrompt = `Help me set up Roster, the local MCP tool-and-skill router, not a model router.

Read ${repository} and its current installation/status documentation. This website describes revision ${release.revision.slice(0, 7)}. First identify any existing Roster installation by its package and path, using --help (there is no --version flag). Do not assume a command named roster belongs to this project.

Check npm availability for ${packageName}@${release.version}. If it is available, prefer the pinned scoped npx flow: ${commandsFor({ ...release, published: true }).prepare}. On Windows use ${commandsFor({ ...release, published: true }, "windows").prepare}. Keep the same pinned npx or npx.cmd prefix for follow-up commands; a one-off npx run does not install a global roster command. Offer a global installation only if I prefer it, rather than relying on an unrelated executable already on PATH. If registry access is unavailable, report the actual lookup failure rather than assuming pre-release status, and offer the documented source build with Node 22.17 or newer within Node 22.x, or Node 24.2 or newer, and pnpm 11.9.0. Keep using node packages/cli/dist/bin.js from that checkout. Never use the unrelated unscoped npm package.

Ask which client and scope I want before changing configuration. Automated sync/eject writers support claude-code, cursor, codex, and openclaw only. Discovery is broader. Roster currently routes command-backed stdio MCP servers, not URL-only servers. Explain which existing file sync will select and what it will change. Do not touch unrelated clients or broaden the authorized scope.

Explain that init --no-dense discovers configurations, imports server definitions (including env) into private local state, and prints a receipt; it does not rewrite client configurations. Run it only with my authorization. Keep credentials, raw client configuration, and receipt paths out of chat and logs. Inspect locally and summarize without secret values.

Start with lexical retrieval. If a previous setup or source checkout already has the embedding runtime, set only embeddings to off in the existing ~/.roster/roster.json before starting a client, preserving all other fields. Explain optional dense enable, the approximately 385 MB runtime plus a first-use model download, and get separate permission before enabling or downloading either. Check native runtime compatibility before recommending dense retrieval; in 0.0.2, ON status confirms package presence, not successful inference, and the verified ONNX Runtime 1.24.3 cannot load on Alpine/musl or x64 macOS.

Review the receipt and existing backups, then scope sync to the chosen --client. Sync backs up originals before replacing the MCP server map with a Roster launcher. The client normally launches serve over stdio; I do not need a separate hosted service. Transparent mode is the default. Explain five mode before enabling it: draft returns up to five candidates, then the agent chooses call; skills return instructions/resources, not automatic script execution.

Explain eject before proceeding. Dedicated configs restore byte-for-byte if unchanged since sync. Supported live-state files restore the original servers at key level while preserving later user changes. Do not use forced restoration or trust overrides. Do not enable telemetry. Preserve the checkout while source-based launchers refer to it. Verify the selected setup without running unrelated backend actions or claiming the whole task is solved. Report what changed and the matching scoped eject command.`;

export function socialMeta(origin?: string | URL, pathname = "/") {
  return {
    image: origin ? new URL("/social.png", origin).href : "/social.png",
    ...(origin ? { canonical: new URL(pathname, origin).href } : {}),
  };
}
