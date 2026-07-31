# Visual audit

What survived, what was redesigned, what was deleted, what was simplified, and
what needed only a motion change — recorded across the passes that produced
`out/premium-v1/`.

---

## 0 · Starting position — read this first

**There was no previous launch film in this worktree.** At the start of the work
`git status` was clean, `apps/launch-film` did not exist, and there were no
earlier renders anywhere in the repository. The brief anticipated inheriting a
draft; there was nothing to inherit.

That changes what an audit can honestly claim. Two consequences, both handled
rather than papered over:

1. **"Preserve existing renders as before references"** had nothing to preserve.
   Instead, `src/qa/RejectedDirection.tsx` *renders* the visual language the
   brief ruled out — dark HUD chrome, thin cyan outlines, a glowing central orb,
   corner brackets, metadata grids, tiny labels — from the same scene data. The
   before/after sheet is therefore a like-for-like comparison of two rendered
   directions, and the sheet says on its face that the left column is a
   reconstruction, not an earlier version of this film.
2. The **redesigned / deleted / simplified** columns below record what changed
   between the *first complete pass of this film* and the delivered version, as
   found by rendering 33 frames, looking at every one, and fixing what was wrong.
   That is a real audit trail; it is just an audit of this work, not of a
   predecessor.

---

## 1 · Structurally useful — kept and built on

Nothing was inherited, so this column records the decisions from the first pass
that survived contact with the rendered frames unchanged.

| Kept | Why it held up |
|---|---|
| **The single-room lighting model** (one fixed key at (470, −160), all shadows via `elevation(lift)`) | This is the reason eleven very different compositions read as one film. Never touched after the first pass. |
| **The scene table as the single source of timing** (`motion/timing.ts`) | Retiming Coach + League was a two-number edit that moved the audio cues with it. Paid for itself immediately. |
| **`productCopy.ts` as the single source of words** | Shortening capability strings to stop ellipsis truncation was one edit in one file that fixed four scenes. |
| **Tapered filled ribbons instead of strokes** | Correct from the first frame. Only their *weight* changed. |
| **Three tool classes** (background / candidate / hero) | The scale problem never came back. Overload reads as "hundreds" with five readable cards. |
| **The hero staging order** (shell → glyph → title → support → connection) | Five cards genuinely read as five instances of one object. |
| **Seeded determinism** (`lib/rng.ts`, `lib/world.ts`) | Re-rendering the same frame after twenty edits produced identical scatter every time. |
| **The warm-white ground and grain** | Only a two-step warmth adjustment; the material was right. |

---

## 2 · Redesigned

| What | Was | Now | Why |
|---|---|---|---|
| **The optical core** | Five wide trapezoid blades on a pentagon, saturated blue fills | Five slim, strongly tapered light-guides, an iris ring, a larger central gate, dispersion on the rim | It read as a radiation/pinwheel hazard symbol — the single worst thing in the first pass. Narrow guides with real negative space read as a precision iris, and the mark now survives being scaled to 26px. |
| **`RosterMark` (the flat logo)** | Fixed 9-unit strokes in a 300-unit viewBox | Stroke weights specified in *rendered pixels*, converted back to design units | At 26px in the terminal rail the old mark collapsed into a black blob. |
| **Starting Five connections** | Five ribbons from five blade tips | Five ribbons from evenly-spaced points on the housing's lower edge (`coreEdge`, `EXIT_ANGLE`) | Five apertures on a pentagon cannot fan to five cards below without crossing. The prism still *lights* the corresponding blade, so the mapping survives. |
| **Tool-call ribbon routing** | Both directions sharing one lane | Request along a top lane, result arcing back under the prism on a bottom lane | The two crossed between the agent and the core and read as a tangle. Direction is the entire point of that shot. |
| **Sixth Man composition** | Suggested card beside the failed one; chips colliding | Suggested card upper-right, failed starter lower-right, chips clear, truth statement bottom-left | The "AGENT ACCEPTED" chip landed on top of the failed card's "STARTER 03" label. |
| **`BreakMark`** | A zigzag *along* the ribbon | A jagged tear *across* the ribbon plus two detached shards | Along the direction of travel, a zigzag reads as an arrowhead — the opposite of the meaning. |
| **Clearing composition** | Headline top-centre, cards mid, bench low, tokens landing per-card | Top half clear for the retracting connections, headline bottom-left, reassurance bottom-right, tokens filed across nine shelf columns from a global index | Retracting ribbons had nowhere to come from without crossing the headline, and per-card landing stacked eighteen tokens into three narrow piles on top of the bench label. |
| **Hook's "five"** | Five chips on the mark's pentagon | Five chips in a quiet row beneath the sentence | Two of them landed on top of the headline. |
| **Initialization inlets** | Endpoints inside the frame, one crossing the whole frame vertically | All five off-frame right | Visible endpoints read as dangling wires. |
| **Wireframe rejection state** | A faint 1.8px outline | 2.4px outline plus an interior glyph box and two label rules | The middle stage of the rejection was nearly invisible, so the transformation read as a fade after all. |
| **Font loading** | `@remotion/fonts` `loadFont()`, then a `document.fonts.ready` race | Plain `@font-face` with `data:` sources, waiting on nothing | Not cosmetic — the first two approaches each aborted the full render at the 118 s `delayRender` timeout. See [PROGRESS.md](PROGRESS.md). |

---

## 3 · Deleted

| Deleted | Why |
|---|---|
| **Evaluation rings** in Search | Thin arcs hanging off the candidate cards' left edges. They were the closest thing in the film to HUD chrome, and the scan plane plus the card state changes already carry "this is being evaluated". Removing them strengthened the frame. |
| **The sixth foreground tool** in Overload | Six readable cards forced one into the copy column, where it collided with "Sources cited in README". Five reads as "many" just as well. |
| **The floating sixth-aperture pentagon** in its original form | It hovered detached above the prism and read as a stray shape. Replaced with an aperture docked to the housing by a visible stem. |
| **The stray accent hairline** in Clearing | A 2px rule at y=700 with no job. It read as a rendering artefact. |
| **`STARTING_FIVE.headline` / `.lede` on screen** | The lineup shot is the film's payoff and needed one focal point. The eyebrow alone labels it; two more lines of type competed with the five cards. (The strings stay in `productCopy.ts` for other surfaces.) |
| **The pentagon layout helper import in Hook** | Left dead by the five-chip redesign. |

---

## 4 · Simplified

| Simplified | From → to |
|---|---|
| **Candidate capability strings** | `"read · write · search local files"` → `"read · write · search"`, `"query a local database"` → `"query a database"`, `"retrieve a URL as text"` → `"retrieve a URL"` on candidate cards. Four scenes were showing ellipsis truncation. |
| **Candidate card width** | 352 → 400px, glyph tile 62 → 60px. Cheaper than shrinking type below the 24px floor. |
| **Coach + League** | A split-screen dashboard → one wide space the camera slides across, with each panel dimming as the camera leaves it. One focal point at a time. |
| **Hero card tint wash** | 16% → 11% alpha. Five differently-tinted cards were tipping from "premium" toward "candy". |
| **Ribbon centre-line highlight** | 16% of ribbon width → 10%, alpha 0.6 → 0.46. At the heavier ribbon weights the highlight had started reading as a second parallel tube. |
| **Bench shelf** | `lightGlass` → `solidGlass`, and its label moved from inside the shelf to above it | A vapour-weight slab disappeared on warm white, and landing tokens crossed the label. |
| **SVG `<defs>` ids** | Four hard-coded literal strings → one `defId()` helper | Also cleared eleven lint violations. |

---

## 5 · Needed only motion or timing work

| Element | Change |
|---|---|
| **Coach + League beats** | Camera hold extended 96 → 118 frames; League beats shifted +24; reorder spring moved to f74. The content was right, there just was not time to read it. |
| **Clearing card stagger** | 0 / 26 / 52 → 0 / 30 / 60 frames, and the four stages spread from 0/34/74/108 to 4/40/86/124. The first rejection now completes as a readable demonstration before the second starts. |
| **Bench label** | Now fades in at f268 instead of f70 — after the shelf is full. A timing change that also removed a collision class entirely. |
| **Lineup ribbon bow** | ±16 → ±10px, weight 0.92 → 0.82. Purely a settling refinement. |
| **Overload bundle** | Width ×3.3, alpha down, soft glow added. Same paths, different weight — hairlines read as scratches on white paper. |
| **Render concurrency** | 4 → 3. Not a design change, but it is what made the render reliable on four cores. |

---

## 6 · Verification performed

- **33 stills** (entry / midpoint / exit for all eleven scenes) rendered and
  visually inspected on every pass — three full passes plus targeted re-renders.
- Checked each time: hierarchy, readability, text/card overlaps, clipping, safe
  margins, stroke weight, depth separation, and whether the frame has one focal
  point.
- **Contact sheet** built from the same frames; the five weakest are named in
  [PROGRESS.md](PROGRESS.md) with what was done about each.
- **QA sheet** overlays the 160/120 social-safe box on six midpoints and prints
  the full claim ledger with sources.
- **55 unit tests** (`pnpm test` at the repository root) covering the scene
  table's contiguity and duration, determinism of the seeded scatter and the
  ribbon geometry, lineup collision-freedom, and the truth invariants — the
  launch command matches the CLI's real `bin`, no scene hard-codes a command, no
  scene uses automatic-substitution language, and the League beat keeps its
  pre-season caveat.
- **The master is decoded end to end** by `pnpm probe`, which asserts resolution,
  frame rate, codecs and the presence of an audio stream. Result: mp4 ·
  1920×1080 · 60.000 fps · 58.048 s · h264 `avc1.64002a` · aac `mp4a.40.02` ·
  2 ch · 48 kHz · **3,480 video + 2,721 audio samples decoded**. The same script
  run against the *preview* correctly FAILS its 1080p assertion, which is how the
  assertions themselves were verified to fire.
- **Remotion Studio** was started on port 3111, confirmed to serve the index, the
  bundle and `/api/project-info`, and then stopped cleanly.

---

## 7 · Repository checks

Run during the final verification pass, from the repository root:

| Check | Result |
|---|---|
| `pnpm typecheck` | **pass** |
| `pnpm test` | **pass — 421 tests across 17 files** (366 pre-existing + 55 added by this work) |
| `pnpm build` | **pass** |
| `pnpm lint` | **pass** |
| `pnpm typecheck` in `apps/launch-film` | **pass** |

No pre-existing failure was found once the workspace was installed. The first
`pnpm typecheck` run *did* fail — on missing `better-sqlite3`, `yaml` and
`@modelcontextprotocol/sdk` — but that was container state (the repository's own
dependencies had never been installed here), not a regression: a full
`pnpm install` resolved it and every check then passed on the first attempt.

One shared-config change was required and is disclosed in
[PROGRESS.md](PROGRESS.md): a `biome.json` override that disables
`correctness/useUniqueElementIds` for `apps/launch-film/src/Root.tsx` only,
because Remotion's `<Composition id>` takes a composition *name* rather than a
DOM id and the prop cannot be renamed. Every other instance of that rule was
fixed in code.
