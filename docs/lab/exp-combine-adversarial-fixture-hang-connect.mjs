#!/usr/bin/env node
// Fake MCP server that SPAWNS but never completes the initialize handshake:
// it reads stdin and never writes stdout. Exercises the runner's
// CONNECT_TIMEOUT path. Writes its pid to argv[2] so the test can confirm the
// runner kills it on suite completion.
import fs from "node:fs";
if (process.argv[2]) fs.writeFileSync(process.argv[2], String(process.pid));
process.stdin.resume();
setInterval(() => {}, 1 << 30); // stay alive forever; never respond
