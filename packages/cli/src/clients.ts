import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { parseJsonc } from "./jsonc.js";
import { homeDir } from "./paths.js";

/** One MCP server entry imported from a client's config. */
export interface ImportedServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  client: ClientId;
  sourcePath: string;
}

export type ClientId =
  | "claude-code"
  | "claude-desktop"
  | "cursor"
  | "codex"
  | "gemini-cli"
  | "hermes"
  | "openclaw"
  | "vscode"
  | "windsurf"
  | "zed";

export interface ClientSpec {
  id: ClientId;
  displayName: string;
  /** Candidate config paths, most canonical first. Existence-probed at runtime. */
  configPaths(): string[];
  parse(content: string, sourcePath: string): ImportedServer[];
  /** Claude Code auto-defers schemas past 10% of context (Jan 2026) — the receipt must say so. */
  nativeToolSearch: boolean;
}

type RawServer = Record<string, unknown>;

function fromMcpServersObject(
  obj: unknown,
  client: ClientId,
  sourcePath: string,
  opts: { urlKeys?: string[] } = {},
): ImportedServer[] {
  if (obj === null || typeof obj !== "object") return [];
  const out: ImportedServer[] = [];
  for (const [name, raw] of Object.entries(obj as Record<string, RawServer>)) {
    if (raw === null || typeof raw !== "object") continue;
    const urlKeys = opts.urlKeys ?? ["url", "httpUrl", "serverUrl"];
    const url = urlKeys.map((k) => raw[k]).find((v) => typeof v === "string") as string | undefined;
    const command = typeof raw.command === "string" ? raw.command : undefined;
    if (!url && !command) continue;
    out.push({
      name,
      command,
      args: Array.isArray(raw.args) ? raw.args.map(String) : undefined,
      env:
        raw.env && typeof raw.env === "object"
          ? Object.fromEntries(
              Object.entries(raw.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
            )
          : undefined,
      url,
      client,
      sourcePath,
    });
  }
  return out;
}

const home = homeDir;

export const CLIENTS: ClientSpec[] = [
  {
    id: "claude-code",
    displayName: "Claude Code",
    nativeToolSearch: true,
    configPaths: () => [
      path.join(home(), ".claude", "settings.json"),
      path.join(process.cwd(), ".mcp.json"),
    ],
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      return fromMcpServersObject(data.mcpServers, "claude-code", sourcePath);
    },
  },
  {
    id: "claude-desktop",
    displayName: "Claude Desktop",
    nativeToolSearch: false,
    configPaths: () => {
      if (process.platform === "win32") {
        return [path.join(process.env.APPDATA ?? path.join(home(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json")];
      }
      return [path.join(home(), "Library", "Application Support", "Claude", "claude_desktop_config.json")];
    },
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      return fromMcpServersObject(data.mcpServers, "claude-desktop", sourcePath);
    },
  },
  {
    id: "cursor",
    displayName: "Cursor",
    nativeToolSearch: false,
    configPaths: () => [
      path.join(home(), ".cursor", "mcp.json"),
      path.join(process.cwd(), ".cursor", "mcp.json"),
    ],
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      return fromMcpServersObject(data.mcpServers, "cursor", sourcePath);
    },
  },
  {
    id: "codex",
    displayName: "Codex",
    nativeToolSearch: false,
    configPaths: () => [path.join(home(), ".codex", "config.toml")],
    parse: (content, sourcePath) => {
      const data = parseToml(content) as Record<string, unknown>;
      return fromMcpServersObject(data.mcp_servers, "codex", sourcePath);
    },
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    nativeToolSearch: false,
    configPaths: () => [path.join(home(), ".gemini", "settings.json")],
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      return fromMcpServersObject(data.mcpServers, "gemini-cli", sourcePath);
    },
  },
  {
    id: "hermes",
    displayName: "Hermes",
    nativeToolSearch: false,
    configPaths: () => [path.join(home(), ".hermes", "config.yaml")],
    parse: (content, sourcePath) => {
      const data = parseYaml(content) as Record<string, unknown> | null;
      return fromMcpServersObject(data?.mcp_servers, "hermes", sourcePath);
    },
  },
  {
    id: "openclaw",
    displayName: "OpenClaw",
    nativeToolSearch: false,
    configPaths: () => [
      path.join(home(), ".openclaw", "openclaw.json"),
      path.join(home(), "openclaw.json"),
    ],
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      return fromMcpServersObject(data.mcpServers, "openclaw", sourcePath);
    },
  },
  {
    id: "vscode",
    displayName: "VS Code",
    nativeToolSearch: false,
    configPaths: () => {
      const base =
        process.platform === "win32"
          ? path.join(process.env.APPDATA ?? path.join(home(), "AppData", "Roaming"), "Code", "User")
          : process.platform === "darwin"
            ? path.join(home(), "Library", "Application Support", "Code", "User")
            : path.join(home(), ".config", "Code", "User");
      return [path.join(base, "mcp.json"), path.join(process.cwd(), ".vscode", "mcp.json")];
    },
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      // VS Code uses `servers`; tolerate `mcpServers` too.
      return fromMcpServersObject(data.servers ?? data.mcpServers, "vscode", sourcePath);
    },
  },
  {
    id: "windsurf",
    displayName: "Windsurf",
    nativeToolSearch: false,
    configPaths: () => [path.join(home(), ".codeium", "windsurf", "mcp_config.json")],
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      return fromMcpServersObject(data.mcpServers, "windsurf", sourcePath);
    },
  },
  {
    id: "zed",
    displayName: "Zed",
    nativeToolSearch: false,
    configPaths: () => [path.join(home(), ".config", "zed", "settings.json")],
    parse: (content, sourcePath) => {
      const data = parseJsonc(content) as Record<string, unknown>;
      return fromMcpServersObject(data.context_servers, "zed", sourcePath);
    },
  },
];

export interface Discovery {
  client: ClientSpec;
  configPath: string;
  servers: ImportedServer[];
  parseError?: string;
}

/** Probe every known client config; parse failures are reported, never fatal. */
export function discoverClients(): Discovery[] {
  const discoveries: Discovery[] = [];
  for (const client of CLIENTS) {
    for (const configPath of client.configPaths()) {
      if (!fs.existsSync(configPath)) continue;
      try {
        const content = fs.readFileSync(configPath, "utf8");
        discoveries.push({ client, configPath, servers: client.parse(content, configPath) });
      } catch (err) {
        discoveries.push({
          client,
          configPath,
          servers: [],
          parseError: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return discoveries;
}
