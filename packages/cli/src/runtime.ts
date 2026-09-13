export function assertWindowsRuntimeSupport(): void {
  if (process.platform !== "win32") return;
  const [major, minor] = process.versions.uv.split(".").map(Number);
  if (major !== undefined && minor !== undefined && (major > 1 || (major === 1 && minor >= 51))) return;
  throw new Error(
    `Roster on Windows requires Node 22.17 or newer within Node 22.x, or Node 24.2 or newer. Node ${process.versions.node} with libuv ${process.versions.uv} cannot provide consistent file identities; upgrade Node before using Roster.`,
  );
}
