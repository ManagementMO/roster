/**
 * Roster launch film — type.
 *
 * Two families, both SIL OFL and both embedded as base64 `@font-face` rules, so
 * no render ever touches the network: Inter for editorial voice, JetBrains Mono
 * for anything the machine says (commands, receipt output, identifiers).
 *
 * The scale is deliberately short. Every size below is at 1920×1080; the film
 * never renders critical text under 24px, and eyebrow labels bottom out at 22px
 * only when they are decorative rather than load-bearing.
 *
 * ── Why fonts are installed this way ─────────────────────────────────────
 * Two approaches were tried and abandoned before this one:
 *
 *  1. `@remotion/fonts` `loadFont()` wraps `new FontFace(...).load()` in a
 *     `delayRender()`. Under a concurrent video render that promise
 *     intermittently never settled and the render aborted at the 118 s timeout —
 *     with an HTTP url AND with a data url, so the fetch was never the problem.
 *  2. Holding the first frame on `document.fonts.ready`, raced against a
 *     `setTimeout` escape hatch. The escape hatch never fired: Remotion replaces
 *     the page's timers with a deterministic clock, so a `setTimeout` in render
 *     is not a wall-clock guarantee. That race could deadlock, and did.
 *
 * So: no promise, no delayRender. A `@font-face` rule with a `data:` source is
 * resolved by Chrome during style resolution, with no network round trip and no
 * JavaScript in the path. A hidden probe element references every face so the
 * glyphs are rasterised during the first layout rather than lazily. A font can
 * no longer stall this film, because nothing waits on one.
 */
import { ink } from "./colors";
import { FONT_DATA } from "./fontData";

export const SANS = "RosterSans";
export const MONO = "RosterMono";

const FACES: Array<{ family: string; weight: number; src: string }> = [
  { family: SANS, weight: 400, src: FONT_DATA.Inter_400 },
  { family: SANS, weight: 500, src: FONT_DATA.Inter_500 },
  { family: SANS, weight: 600, src: FONT_DATA.Inter_600 },
  { family: SANS, weight: 700, src: FONT_DATA.Inter_700 },
  { family: MONO, weight: 400, src: FONT_DATA.JetBrainsMono_400 },
  { family: MONO, weight: 500, src: FONT_DATA.JetBrainsMono_500 },
  { family: MONO, weight: 700, src: FONT_DATA.JetBrainsMono_700 },
];

const FONT_CSS = FACES.map(
  (f) =>
    `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;src:url(${f.src}) format('woff2');}`,
).join("\n");

/**
 * The probe: one off-screen line per face, so the first layout pass rasterises
 * every weight instead of discovering them one scene at a time.
 */
const PROBE_CSS = `.roster-font-probe{position:fixed;left:-9999px;top:-9999px;pointer-events:none;opacity:0;}`;
const PROBE_HTML = FACES.map(
  (f) => `<span style="font-family:'${f.family}';font-weight:${f.weight}">Roster 0123</span>`,
).join("");

function installFonts(): boolean {
  if (typeof document === "undefined") return false;
  const STYLE_ID = "roster-film-fonts";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${FONT_CSS}\n${PROBE_CSS}`;
    document.head.appendChild(style);
    const probe = document.createElement("div");
    probe.className = "roster-font-probe";
    probe.setAttribute("aria-hidden", "true");
    probe.innerHTML = PROBE_HTML;
    document.body.appendChild(probe);
  }
  return true;
}

/** Runs at module load, before React composes the first frame. */
export const fontsReady = installFonts();

type Style = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: string;
  lineHeight: number;
  color: string;
};

const sans = (
  fontSize: number,
  fontWeight: number,
  letterSpacing: string,
  lineHeight: number,
  color: string,
): Style => ({ fontFamily: SANS, fontSize, fontWeight, letterSpacing, lineHeight, color });

const mono = (
  fontSize: number,
  fontWeight: number,
  letterSpacing: string,
  lineHeight: number,
  color: string,
): Style => ({ fontFamily: MONO, fontSize, fontWeight, letterSpacing, lineHeight, color });

export const type = {
  /** The hook. One line, enormous, tight. */
  display: sans(132, 700, "-0.045em", 0.98, ink.strong),
  /** Scene headlines. */
  headline: sans(88, 600, "-0.035em", 1.02, ink.strong),
  /** Secondary headline / brand tagline. */
  title: sans(58, 600, "-0.028em", 1.1, ink.strong),
  /** Hero card names. */
  cardTitle: sans(40, 600, "-0.02em", 1.12, ink.strong),
  /** Supporting sentence under a headline. */
  lede: sans(38, 400, "-0.012em", 1.34, ink.muted),
  /** Card capability line. */
  support: sans(27, 500, "-0.006em", 1.3, ink.muted),
  /** Eyebrow / section label. All caps, wide. */
  eyebrow: sans(26, 600, "0.20em", 1.2, ink.faint),
  /** Small all-caps state chip (decorative, never load-bearing). */
  chip: sans(22, 600, "0.16em", 1.2, ink.faint),
  /** Terminal and command type. */
  code: mono(30, 400, "0em", 1.62, ink.base),
  /** The launch command in the final reveal. */
  command: mono(38, 500, "0em", 1.3, ink.strong),
  /** Starter numbering. */
  starterNo: mono(24, 700, "0.22em", 1.2, ink.faint),
} as const satisfies Record<string, Style>;

/** Optical nudge for all-caps tracking blocks so they sit visually centred. */
export const trackedCentering = (letterSpacing: string): { marginRight: string } => ({
  marginRight: `-${letterSpacing}`,
});
