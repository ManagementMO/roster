# Film brief

**Roster — launch film, premium v1**
1920 × 1080 · 60 fps · 58.00 s · H.264 / yuv420p / BT.709 · AAC stereo

---

## 1 · What this film has to do

Roster is a **local-first tool router for AI agents**. The product is easy to
misunderstand in two directions at once: people either hear "another MCP gateway"
or they hear a claim the product cannot yet back. The film has to defeat both in
under a minute, using a metaphor the audience already owns.

**The sentence the whole film hangs on** (README, line 3):

> Your agent has 200 tools. Only five get to start.

That is a sports-draft frame, and it is exact rather than decorative: `draft(need)`
selects a **starting five**, the rest sit on the **bench**, the **Coach** learns
from local outcomes, the **Combine** certifies, and the **Sixth Man** is the
alternate who comes off the bench — *suggested*, never auto-substituted.

---

## 2 · Audience and posture

Engineers who run Claude Code, Codex, Cursor or OpenClaw, have too many MCP
servers configured, and have felt the context bill. They are allergic to
marketing that overstates. So:

- **Every number on screen is cited or measured.** The two context/accuracy
  statistics are quoted from the third-party research README already cites. The
  one League figure is the one Combine run this repository actually contains.
- **Every limit is on screen too.** "Pre-release · not yet published to npm."
  "PRE-SEASON." "Illustrative run." "Suggest-only."
- **The command shown is the command that exists.** `roster init` — verified in
  `packages/cli/package.json` (`bin`) and `packages/cli/src/bin.ts`. The film
  deliberately does *not* show `npx roster init`, because npm `roster` is a
  third-party package (STATUS P1) and `packages/cli/src/entry.ts` refuses to
  write that form for exactly that reason.

The single source of every word is `src/productCopy.ts`, and every entry there
carries its provenance in a comment. The QA sheet prints the whole claim ledger.

---

## 3 · Creative direction

**Warm-white premium optical glass.** Luminous mineral paper, translucent glass
with real bevels and dispersion, graphite typography, restrained blue / violet /
cyan / amber accents, coral reserved exclusively for failure. Soft natural
shadows from one fixed key light. Editorial whitespace. Elegant, slow camera.

The reference points are Apple product film and Stripe's marketing surfaces: the
subject is a precision instrument sitting on a lit white table, photographed with
patience.

**A subtle sports-draft grammar sits underneath**, never on top: the Starting
Five stand on a shared floor line like a team photo; the crest hangs above them;
they lock centre-outward the way a lineup is announced; the bench is a plinth
that things are filed onto rather than thrown away.

### Deliberately avoided

Dark cyberpunk HUD · crypto trailer · videogame interface · hackathon demo ·
generic SaaS cards · slideshow · random particles · thin cyan outlines · a
glowing central orb · tiny metadata, progress bars, corner brackets and grids ·
interchangeable rounded rectangles.

`src/qa/RejectedDirection.tsx` renders that rejected language from the same scene
data, so the before/after sheet is a comparison rather than an assertion.

---

## 4 · The central object

The film needed one recognisable thing that is not an orb. It is a
**five-aperture routing prism**: a pentagonal optical housing containing five
slim light-guides converging on a central gate.

It earns its place three ways. Its five-ness is structural, so you can literally
count the starting five in the mark. It has real states — idle, listening,
searching, routing, success, learning, failure, suggestion — so it *behaves*
rather than glows. And it resolves into the wordmark in the final shot, so the
last frame pays off fifty seconds of watching it work.

---

## 5 · Structure

| Beat | Time | The idea |
|---|---|---|
| Hook | 0:00–0:03 | The sentence, readable in under a second |
| Terminal | 0:03–0:10 | One real command, one real receipt — which then *becomes* the tool universe |
| Overload | 0:10–0:17 | The problem, as physical pressure on one agent |
| Initialization | 0:17–0:23 | N entries become one; relief |
| Search | 0:23–0:31 | `draft(need)` — a plane of light that visibly evaluates |
| Clearing | 0:31–0:37 | The cut, authored in four physical stages; nothing deleted |
| Starting Five | 0:37–0:43 | The payoff. Five cards lock centre-outward under the crest |
| Tool call | 0:43–0:47 | Agent → Roster → capability → result, unmistakable |
| Sixth Man | 0:47–0:50 | A failure, and a **suggestion** that waits for the agent |
| Coach + League | 0:50–0:54 | It learns locally; certification is pre-season |
| Reveal | 0:54–0:58 | The lineup becomes the mark. Hold long enough to read |

Full beat-by-beat timing: [SHOTLIST.md](SHOTLIST.md).

---

## 6 · The muted test

The film is designed to be understood with the sound off, because that is how it
will mostly be watched. Every beat is carried by geometry first and by copy
second:

- Overload is *many objects pressing into one*.
- Initialization is *many lines becoming one line*.
- Search is *a plane of light passing over things and changing them*.
- Clearing is *a connection tearing, a body draining, fragments falling*.
- The lineup is *five objects turning to face you and stopping*.
- The tool call is *out along the top, back along the bottom*.
- The Sixth Man is *a dashed line that only goes solid after the agent moves*.

The score exists to add weight, not information.

---

## 7 · Audio

An original, fully procedural score — no samples, no licensing, generated by
`scripts/generate-audio.mjs` from the cue table in `src/audio/cues.ts`, which
derives its frame numbers from `src/motion/timing.ts` so picture and sound cannot
drift.

A quiet bed of two detuned pads and filtered air runs the whole film. Everything
else is a small physical model — an exciter through a decaying resonator — which
is why the lineup impacts and the identity hit sound related. Peak-normalised to
−1.5 dBFS with a soft knee and 30 ms edge fades.

Cue families: ambient · typing · overload tension · initialization shift · scan
sweeps · rejection fragments · five lineup impacts · request and return signals ·
one restrained failure · Sixth Man activation · final identity impact.

---

## 8 · Constraints honoured

- Free / open-source / local assets only. Fonts are Inter and JetBrains Mono
  (both SIL OFL 1.1), inlined from `node_modules` at build time. No stock
  footage, no paid APIs, no AI-generated video, no commercial music, and **no
  network-loaded assets at render time**.
- Fully deterministic: `useCurrentFrame()`, `interpolate()`, `spring()`, SVG
  paths and masks, and a seeded mulberry32 stream. No `Math.random()`, no CSS
  animation, no timers.
- No commit, no push, no changes to unrelated files.
