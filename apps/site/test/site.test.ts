import { describe, expect, it } from "vitest";
import { commandsFor, packageName, release, setupPrompt, socialMeta } from "../src/lib/site.js";
import { capabilities, presets, initialDemoState, reduceDemo, exampleCall } from "../src/lib/demo.js";

describe("release-aware setup", () => {
  it("keeps a usable source fallback when publication is unavailable", () => {
    expect(packageName).toBe("@npmmo/roster");
    const commands = commandsFor({ ...release, published: false });
    expect(commands.init).toBe("node packages/cli/dist/bin.js init --no-dense");
    expect(commands.sync).toBe("node packages/cli/dist/bin.js sync --client cursor");
    expect(commands.prepare).toContain("pnpm install --frozen-lockfile");
    expect(commands.prepare).toContain(release.revision);
  });

  it("downloads and initializes the verified release in one command", () => {
    const commands = commandsFor(release);
    expect(commands.prepare).toBe("npx --yes @npmmo/roster@0.0.2 init --no-dense");
    expect(commands.help).toBe("npx --yes @npmmo/roster@0.0.2 --help");
    expect(commands.init).toBe("npx --yes @npmmo/roster@0.0.2 init --no-dense");
  });

  it("keeps follow-up commands pinned without assuming a global executable", () => {
    const commands = commandsFor({ ...release, published: true, version: "0.1.0" });
    expect(commands.prepare).toBe("npx --yes @npmmo/roster@0.1.0 init --no-dense");
    expect(commands.sync).toBe("npx --yes @npmmo/roster@0.1.0 sync --client cursor");
    expect(commands.eject).toBe("npx --yes @npmmo/roster@0.1.0 eject --client cursor");
    expect(commands.globalInstall).toBe("npm install --global @npmmo/roster@0.1.0");
  });

  it("uses Windows command shims without PowerShell policy changes or shell chaining", () => {
    const commands = commandsFor({ ...release, published: true, version: "0.1.0" }, "windows");
    expect(commands.prepare).toBe("npx.cmd --yes @npmmo/roster@0.1.0 init --no-dense");
    expect(commands.sync).toBe("npx.cmd --yes @npmmo/roster@0.1.0 sync --client cursor");
    expect(commands.eject).toBe("npx.cmd --yes @npmmo/roster@0.1.0 eject --client cursor");
    expect(commands.globalInstall).toBe("npm.cmd install --global @npmmo/roster@0.1.0");
  });

  it("retains the source entry point for Windows when npm publication is unavailable", () => {
    const commands = commandsFor({ ...release, published: false }, "windows");
    expect(commands.prepare).toContain("pnpm.cmd install --frozen-lockfile");
    expect(commands.init).toBe("node packages/cli/dist/bin.js init --no-dense");
  });

  it("gives agents explicit consent and privacy boundaries, not dangerous shortcuts", () => {
    expect(setupPrompt).toContain("@npmmo/roster");
    expect(setupPrompt).toContain("embeddings");
    expect(setupPrompt).toContain("authorized");
    expect(setupPrompt).toContain("--no-dense");
    expect(setupPrompt).not.toMatch(/npx (?:-y )?roster\b/);
    expect(setupPrompt).toContain("Do not enable telemetry");
  });

  it("does not invent a production origin", () => {
    expect(socialMeta()).not.toHaveProperty("canonical");
    expect(socialMeta("https://example.org", "/docs/introduction/").canonical).toBe("https://example.org/docs/introduction/");
    expect(socialMeta("https://example.org").image).toBe("https://example.org/social.png");
  });
});

describe("starting-five example", () => {
  it("changes the lineup with the task and keeps every choice inspectable", () => {
    expect(presets).toHaveLength(3);
    expect(new Set(presets.map((preset) => preset.lineup.join())) .size).toBe(3);
    for (const preset of presets) {
      expect(preset.lineup).toHaveLength(5);
      expect(new Set(preset.lineup).size).toBe(5);
      for (const id of preset.lineup) {
        const capability = capabilities[id];
        expect(capability?.description.length).toBeGreaterThan(10);
        expect(capability?.result.length).toBeGreaterThan(10);
      }
    }
  });

  it("resets the call evidence when changing a task or capability", () => {
    const called = reduceDemo(initialDemoState, { type: "call" });
    expect(called.called).toBe(true);
    const changed = reduceDemo(called, { type: "preset", index: 1 });
    expect(changed.called).toBe(false);
    expect(changed.selected).toBe(presets[1]!.lineup[0]);
    const selected = reduceDemo(called, { type: "select", id: presets[0]!.lineup[1]! });
    expect(selected.called).toBe(false);
  });

  it("ignores invalid selections instead of creating a broken state", () => {
    expect(reduceDemo(initialDemoState, { type: "preset", index: 100 })).toEqual(initialDemoState);
    expect(reduceDemo(initialDemoState, { type: "select", id: "missing" })).toEqual(initialDemoState);
  });

  it("uses the actual draft/call argument contract", () => {
    expect(exampleCall(initialDemoState)).toEqual({
      tool: initialDemoState.selected,
      args: capabilities[initialDemoState.selected]!.args,
      draft_id: "d1",
    });
    for (const capability of Object.values(capabilities).filter((item) => item.kind === "skill")) {
      expect(capability.id).toMatch(/^skill__/);
      expect(capability.resources?.length).toBeGreaterThan(0);
      expect(capability.outcomeNote).toContain("excluded from ratings");
    }
  });
});
