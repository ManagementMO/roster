/**
 * Truth tests.
 *
 * The film makes claims about a product that is not released. These tests are
 * the mechanical half of keeping it honest: they assert that the launch command
 * exists exactly once and matches the CLI's real `bin` entry, that no scene
 * hard-codes a command string of its own, that the Sixth Man copy stays
 * suggestion-only, and that the League beat never drops its pre-season caveat.
 *
 * The editorial half — is this claim actually supported? — lives in the
 * provenance comments in `productCopy.ts` and in the claim ledger the QA sheet
 * prints.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLAIM_LEDGER,
  CLEARING,
  COACH_LEAGUE,
  HOOK_LINES,
  LAUNCH_COMMAND,
  LAUNCH_COMMAND_NOTE,
  REVEAL,
  SEARCH,
  SIXTH_MAN,
  STARTERS,
  TAGLINE,
  TERMINAL,
} from "./productCopy";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");

/** A scene's source with its comments removed — only what actually renders. */
function withoutComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("*") || t.startsWith("/*") || t.startsWith("//") || t.startsWith("*/"));
    })
    .join("\n");
}

const sceneSources = fs
  .readdirSync(path.join(HERE, "scenes"))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => {
    const text = fs.readFileSync(path.join(HERE, "scenes", f), "utf8");
    return { name: f, text, rendered: withoutComments(text) };
  });

describe("the launch command", () => {
  it("matches the bin name the CLI package actually declares", () => {
    const cliPkg = JSON.parse(fs.readFileSync(path.join(REPO, "packages/cli/package.json"), "utf8"));
    expect(Object.keys(cliPkg.bin)).toContain("roster");
    expect(LAUNCH_COMMAND.split(" ")[0]).toBe("roster");
  });

  it("names a subcommand the CLI implements", () => {
    const bin = fs.readFileSync(path.join(REPO, "packages/cli/src/bin.ts"), "utf8");
    const sub = LAUNCH_COMMAND.split(" ")[1];
    expect(sub).toBeTruthy();
    expect(bin).toContain(`case "${sub}":`);
  });

  it("is never shown as an npx invocation — npm `roster` is a third-party package", () => {
    // packages/cli/src/entry.ts refuses to write `npx -y roster` for exactly this
    // reason; a launch film must not advertise what the product itself refuses.
    expect(LAUNCH_COMMAND).not.toMatch(/npx|uvx|npm |pnpm /);
    for (const scene of sceneSources) {
      expect(scene.rendered, `${scene.name} must not print an npx install line`).not.toMatch(/npx\s+(-y\s+)?roster/);
    }
  });

  it("travels with an honest pre-release qualifier", () => {
    expect(LAUNCH_COMMAND_NOTE.toLowerCase()).toContain("not yet published");
    expect(REVEAL.note).toBe(LAUNCH_COMMAND_NOTE);
  });

  it("is centralised — no scene hard-codes a command string", () => {
    // Comments are stripped first: a scene is allowed to *explain* what it shows,
    // it is just not allowed to author the string it renders.
    for (const scene of sceneSources) {
      expect(scene.rendered, `${scene.name} hard-codes the launch command`).not.toContain(LAUNCH_COMMAND);
      expect(scene.rendered, `${scene.name} hard-codes a roster subcommand`).not.toMatch(
        /["'`]roster (init|sync|serve|eject)/,
      );
    }
  });

  it("appears in exactly one place in the copy module", () => {
    const copy = fs.readFileSync(path.join(HERE, "productCopy.ts"), "utf8");
    const declarations = copy.match(/^export const LAUNCH_COMMAND = /gm) ?? [];
    expect(declarations).toHaveLength(1);
  });
});

describe("scenes source their words rather than authoring them", () => {
  it("imports copy from productCopy in every scene that shows words", () => {
    for (const scene of sceneSources) {
      if (scene.name === "SceneShell.tsx") continue;
      expect(scene.text, `${scene.name} should import from productCopy`).toContain('from "../productCopy"');
    }
  });
});

describe("the hook", () => {
  it("says the same sentence as the README tagline", () => {
    const joined = HOOK_LINES.join(" ").toLowerCase().replace(/\s+/g, " ");
    expect(joined).toBe(TAGLINE.toLowerCase().replace(/\s+/g, " "));
  });

  it("matches README line 3 verbatim", () => {
    const readme = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
    expect(readme).toContain(TAGLINE);
  });
});

describe("the Sixth Man stays suggestion-only", () => {
  it("says so in words on screen", () => {
    expect(SIXTH_MAN.truth.toLowerCase()).toContain("suggest-only");
    expect(SIXTH_MAN.truth.toLowerCase()).toContain("never executes");
  });

  it("labels the alternate as awaiting the agent, not as substituted", () => {
    expect(SIXTH_MAN.suggestedLabel).toBe("SUGGESTED");
    expect(SIXTH_MAN.awaitingLabel).toBe("AWAITING AGENT");
    expect(SIXTH_MAN.acceptedLabel.toLowerCase()).toContain("agent");
  });

  it("names the payload the router really attaches", () => {
    const router = fs.readFileSync(path.join(REPO, "packages/router/src/rosterServer.ts"), "utf8");
    expect(router).toContain("suggested_alternate");
    expect(SIXTH_MAN.payload).toContain("suggested_alternate");
  });

  it("never uses automatic-substitution language anywhere in a scene", () => {
    const banned = /auto[- ]?(execute|substitut|failover|retry|rescue|swap)/i;
    for (const scene of sceneSources) {
      expect(scene.rendered, `${scene.name} implies automatic substitution`).not.toMatch(banned);
    }
  });
});

describe("the League beat stays pre-season", () => {
  it("stamps the status on screen", () => {
    expect(COACH_LEAGUE.league.status).toBe("PRE-SEASON");
  });

  it("says a human has to sign before a named score publishes", () => {
    expect(COACH_LEAGUE.league.truth.toLowerCase()).toContain("human signs");
    expect(COACH_LEAGUE.league.truth.toLowerCase()).toContain("unsigned");
  });

  it("shows only the Combine result this repository actually contains", () => {
    expect(COACH_LEAGUE.league.result).toBe("8 / 8");
    expect(COACH_LEAGUE.league.suite).toBe("suites/filesystem");
    expect(fs.existsSync(path.join(REPO, "suites", "filesystem"))).toBe(true);
  });
});

describe("the Coach beat states its own limits", () => {
  it("says what is not stored", () => {
    const lede = COACH_LEAGUE.coach.lede.toLowerCase();
    expect(lede).toContain("prompts");
    expect(lede).toContain("are not");
  });
});

describe("the terminal beat is labelled", () => {
  it("marks the receipt as illustrative", () => {
    expect(TERMINAL.disclaimer.toLowerCase()).toContain("illustrative");
  });

  it("uses the centralised command", () => {
    expect(TERMINAL.command).toBe(LAUNCH_COMMAND);
  });

  it("closes on the line `roster init` really prints", () => {
    const init = fs.readFileSync(path.join(REPO, "packages/cli/src/init.ts"), "utf8");
    expect(init).toContain(TERMINAL.closing);
  });
});

describe("structural copy invariants", () => {
  it("names exactly five starters, numbered 01–05", () => {
    expect(STARTERS).toHaveLength(5);
    expect(STARTERS.map((s) => s.no)).toEqual(["01", "02", "03", "04", "05"]);
  });

  it("attaches no score, rank or rating to any starter", () => {
    for (const s of STARTERS) {
      expect(JSON.stringify(s)).not.toMatch(/score|rank|rating|%|\bwilson\b/i);
    }
  });

  it("announces four ranking signals, all of them implemented", () => {
    expect(SEARCH.signals).toHaveLength(4);
    expect(SEARCH.signals.map((s) => s.key)).toEqual(["fit", "reliability", "latency", "history"]);
  });

  it("promises the bench keeps things rather than deleting them", () => {
    expect(CLEARING.lede.toLowerCase()).toContain("nothing is deleted");
  });

  it("gives every ledger entry a source", () => {
    expect(CLAIM_LEDGER.length).toBeGreaterThanOrEqual(10);
    for (const row of CLAIM_LEDGER) {
      expect(row.claim.length).toBeGreaterThan(10);
      expect(row.source.length).toBeGreaterThan(4);
    }
  });
});
