# Shotlist

1920 × 1080 · 60 fps · 3,480 frames · **58.00 s**

Scene boundaries are defined once, in `src/motion/timing.ts`. Nothing below is
typed twice — the audio cue table, the QA sample frames and this document all
derive from that table.

| # | Scene | Frames | Time | Source |
|---|---|---|---|---|
| 1 | Hook | 0–179 | 0:00–0:03 | `S01Hook.tsx` |
| 2 | Terminal | 180–599 | 0:03–0:10 | `S02Terminal.tsx` |
| 3 | Overload | 600–1019 | 0:10–0:17 | `S03Overload.tsx` |
| 4 | Roster initialization | 1020–1379 | 0:17–0:23 | `S04Initialize.tsx` |
| 5 | Search | 1380–1859 | 0:23–0:31 | `S05Search.tsx` |
| 6 | Clearing | 1860–2219 | 0:31–0:37 | `S06Clearing.tsx` |
| 7 | Starting Five | 2220–2579 | 0:37–0:43 | `S07StartingFive.tsx` |
| 8 | Tool call | 2580–2819 | 0:43–0:47 | `S08ToolCall.tsx` |
| 9 | Sixth Man | 2820–2999 | 0:47–0:50 | `S09SixthMan.tsx` |
| 10 | Coach and League | 3000–3239 | 0:50–0:54 | `S10CoachLeague.tsx` |
| 11 | Final reveal | 3240–3479 | 0:54–0:58 | `S11Reveal.tsx` |

---

## 1 · Hook — 0:00–0:03

**Frame.** Centred display type on empty warm-white paper. A field of anonymous
capability chips sits far behind at the edge of perception, held clear of the
type by a radial falloff.

**Beats.** Line 1 lands f4–34. Line 2 lands f24–54 — **the whole sentence is
readable by f54 (0.9 s)**, well inside the two-second requirement. "FIVE" warms
to full blue f58–78. The field dims f84–116 while five chips brighten in a quiet
row beneath the sentence f86–122.

**Camera.** A 1.03 → 1.00 settle across the scene. Nothing else moves.

**Copy.** `HOOK_LINES` — README line 3, verbatim.

**Audio.** Ambient bed only. The film opens quiet on purpose.

---

## 2 · Terminal — 0:03–0:10

**Frame.** One 1188 × 608 sheet of optical glass, centred, floating 54px off the
paper. A hairline rail with the Roster mark and `LOCAL SHELL`; below it a frosted
well the machine speaks into.

**Beats.** Panel arrives f0–30. Typing starts f34 at 2.4 frames per character.
The Day-0 receipt prints from f108, one line every 7 frames. The honesty caption
fades in f126. From **f292 the receipt physically becomes the tool universe**:
each output line's characters lift off as glass chips and fly outward past
camera, and the lines fade individually behind them.

**Camera.** Push 1.06 → 1.015 during the type, then pull back to 0.93 as the
receipt disassembles — the pull-out becomes the move into Overload.

**Copy.** `TERMINAL` — the command from `LAUNCH_COMMAND`, the receipt shape from
`packages/cli/src/receipt.ts`, and the on-screen label *"Illustrative run ·
counts are read from your own configs"*.

**Audio.** Eleven typing ticks on the exact typed characters, eight softer ticks
on the printing lines, one filtered downward shift on liftoff.

---

## 3 · Overload — 0:10–0:17

**Frame.** Copy column top-left. Five readable capability cards in the near
field, 168 anonymous ones receding behind them across three depth bands, and one
wide agent slab at the bottom centre with every route converging into it.

**Beats.** The field arrives on a 92-frame radial cascade. Bundled traffic draws
f56–170. Agent strain climbs f120–300 and warms its rim toward amber.

**Camera.** Zoom 0.97 → 1.055 with a downward drift — pressure toward the agent.

**Copy.** `OVERLOAD` — both statistics quoted from README §Why, with *"Sources
cited in README"* on screen.

**Audio.** A rising filtered noise band with a tremolo that speeds up. It never
becomes a drone.

---

## 4 · Roster initialization — 0:17–0:23

**Frame.** The prism materialises at (1214, 462) exactly where the tangle used to
converge. Five clean ribbons come in from off-frame right; one thick ribbon runs
down to a single agent slab.

**Beats.** The bundle collapses f10–96. The core arrives f56–108, rotating −26°
into place. Clean ribbons draw f92–168, staggered. The agent link draws f156–214
and then carries a repeating light packet.

**Camera.** Pull 1.05 → 0.995, drifting left as the field defocuses.

**Copy.** `INITIALIZE` — *"N entries become one."* · *"Local stdio · no account ·
no API key."*

**Audio.** The clean shift: a filtered sweep down onto a soft consonance, then
one low impact as the core lands.

---

## 5 · Search — 0:23–0:31

**Frame.** Text column left (`draft(need)` set in 62px mono), seven candidates in
an organic cluster right. No prism — the plane of light *is* Roster searching.

**Beats.** Sweep one f40–200 (reconnaissance, violet). Sweep two f236–400
(decisive, blue). Candidates take their substance from `scanResolve` at their own
x: starters come forward and take the selected spine, non-starters sink into the
depth field. The four ranking signals announce one at a time from f92, 92 frames
each.

**Camera.** Push 1.00 → 1.045, drifting right with the sweep.

**Copy.** `SEARCH.signals` — task fit, reliability, latency, outcome history.
Each is implemented; the provenance is in `productCopy.ts`.

**Audio.** Two band-passed noise sweeps that pan left to right with the plane,
plus one soft tick per signal change.

---

## 6 · Clearing — 0:31–0:37

**Frame.** Upper half clear for the retracting connections. Three cut cards on
one line. A bench plinth below. Headline bottom-left, the reassurance bottom-right.

**Beats — the authored rejection, staggered 0 / 30 / 60 frames per card.**

| Offset | Stage |
|---|---|
| +4 | the connection to Roster **retracts upward and tears** |
| +40 | the glass body **drains into a wireframe** — silhouette, glyph box and two label rules survive |
| +86 | the labels **fragment into schema tokens** (`name`, `description`, `inputSchema`, `type`, `required`, `annotations` — real MCP tool-definition keys) |
| +124 | the fragments **fall to the bench** and file themselves across nine columns |
| +268 | the bench is *named* — only once it is full, so nothing falls across its label |

**Camera.** 1.03 → 1.00 with a downward drift that follows the fall.

**Copy.** `CLEARING` — *"The rest go to the bench."* · *"Nothing is deleted…"*

**Audio.** Three granular fragment clusters, each with a low settle underneath.

---

## 7 · Starting Five — 0:37–0:43

**Frame.** The crest above, the lineup below. Five hero cards standing on a
shared floor line at y=946 with the centre card tallest — a team photo, not a
card grid. The prism at (960, 258) with five ribbons fanning cleanly off its
lower edge.

**Beats.** Cards enter **centre outward** — position 2 at f44, then 1, 0, 3, 4 at
26-frame intervals. Each card rotates from −74° about Y and 320px back in Z, and
locks on the `lock` spring; the prism blade above it lights as it settles, its
ribbon draws, and a spectral flash crosses the glass. Five locks build a soft
bloom to a controlled peak.

**Camera.** 1.09 → 1.00 → 1.02 with a slight rise — the shot settles as the
lineup does.

**Copy.** `STARTING_FIVE.eyebrow` and the five `STARTERS`. No score, no rank, no
metadata on any card.

**Audio.** Five soft low impacts, tuned 0 / −5 / −7 / +4 / +7 semitones, each
with a bell partial.

---

## 8 · Tool call — 0:43–0:47

**Frame.** The emptiest shot in the film: agent left, prism centre, one hero card
right. Request runs out along a top lane; the result arcs back underneath the
prism on a bottom lane. The two never cross.

**Beats.** Request draws f26 with a travelling packet. It re-emerges from the
prism f78 and reaches the capability. The result returns f132. The agent pulses
once on receipt.

**Camera.** A gentle 1.00 → 1.03 push.

**Copy.** `TOOL_CALL` — `call(tool, args)` on the outbound lane, `result` on the
return, and one sentence at the bottom.

**Audio.** Two short rising blips out, one warmer falling blip back.

---

## 9 · Sixth Man — 0:47–0:50

**Frame.** Agent left, prism centre, the failed starter lower right, the
suggested alternate upper right. The truth statement bottom-left.

**Beats.**

| Frame | Event |
|---|---|
| 8 | `fetch` hard-fails. One restrained coral wash, one frame of chromatic split |
| 14–54 | the routing ribbon **tears across its width** and retracts; two shards fly off |
| 50–84 | `http-get` rises, tagged **AWAITING AGENT**; a **dashed** violet ribbon reaches toward it; a sixth aperture docks on the prism |
| 58 | `_roster.suggested_alternate` and the sentence *"Suggest-only. Roster never executes the alternate — the agent decides."* |
| 114–140 | the agent visibly **accepts** — it pulses, and only then does the ribbon go solid and the chip flip to **AGENT ACCEPTED** |

**This scene never shows automatic substitution.** The router is suggest-only
(`packages/router/src/rosterServer.ts`); auto-substitution is an open owner
decision (STATUS-FOR-MO P8).

**Audio.** One restrained, waveshaped low failure. An ascending minor triad for
the suggestion. One small impact on acceptance.

---

## 10 · Coach and League — 0:50–0:54

**Frame.** One wide space with two panels; the camera slides between them so
there is one focal point at a time and never a dashboard.

**Beats.** Coach holds to f118: three capability rows accumulate outcome pips
(blue = ok, coral = a recorded failure) and then **reorder** on the `heavy`
spring so the tool that works on this stack rises to the top. The camera slides
f118–168. League from f146: `suites/filesystem`, **8 / 8**, *tasks passed ·
deterministic*, a **PRE-SEASON** chip, and the sentence *"No named score
publishes until a human signs the run."*

**Copy.** `COACH_LEAGUE` — the privacy line is the exact scope of what the Coach
stores; the League number is the one Combine result this repository contains.

**Audio.** One tick as the rows reorder; one soft shift under the camera slide.

---

## 11 · Final reveal — 0:54–0:58

**Frame.** Five points travel from the lineup positions into the five blade
positions of the mark, which lands at (960, 300). Then the frame goes quiet and
holds.

**Beats.** Convergence f0–68. Mark arrives f62 on the `heavy` spring with a −22°
settle and one controlled bloom. `ROSTER` cascades f88. Tagline f124. Command
plate f150, pre-release note f168, licence f184. **The last 56 frames are a still
hold** — enough time to read the command.

**Copy.** `REVEAL` — wordmark, README's own tagline, `roster init`, *"Pre-release
· not yet published to npm"*, *"MIT · open source"*.

**Audio.** One broad low identity impact under a sustained open chord that runs
to the end of the film.

---

## Transitions

Scenes are contiguous, not overlapping. A handoff is three things at once,
occupying 40–60 frames: the outgoing content lifts and softens (24 frames), a
soft white light wipe crosses the frame (40 frames, centred on the boundary), and
the incoming content settles and sharpens (26 frames).

Three boundaries are **continuations** rather than cuts — 600 (the receipt
becoming the universe), 2220 (the cut becoming the lineup) and 3240 (the lineup
becoming the mark). Those wipes render at 34% strength so the physical continuity
stays legible.

---

## Poster frame

**f3420** — the reveal fully composed: mark, wordmark, tagline, command plate,
pre-release note and licence, before the final fade begins at f3456.
