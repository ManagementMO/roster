import { loadConfig, saveConfig } from "./rosterfile.js";

/**
 * Telemetry is OFF by default, local-first, opt-in (the Go model). There is
 * no upload endpoint yet — even "on" only marks consent locally; nothing is
 * sent anywhere. docs/telemetry-schema.md is the published contract.
 */
export function telemetry(action: "status" | "on" | "off"): void {
  const config = loadConfig();
  if (action === "on") {
    config.telemetry.enabled = true;
    saveConfig(config);
    process.stdout.write(
      "Telemetry consent recorded locally. NOTE: no upload endpoint exists yet — nothing is transmitted.\n" +
        "What would ever be sent (and what never will be) is documented in docs/telemetry-schema.md.\n",
    );
    return;
  }
  if (action === "off") {
    config.telemetry.enabled = false;
    saveConfig(config);
    process.stdout.write("Telemetry off (the default).\n");
    return;
  }
  process.stdout.write(
    `Telemetry: ${config.telemetry.enabled ? "opted in (no endpoint exists yet — nothing transmitted)" : "OFF (default)"}\n` +
      "Schema: docs/telemetry-schema.md · Hard exclusions: prompts, needs, args, results, embeddings, hostnames, paths.\n",
  );
}
