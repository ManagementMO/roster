# Visual system

The design language of the Roster launch film, and the code that implements it.

**Origin:** every component below is **code-native**. Figma MCP was not connected
in the session this film was built in, so nothing here originates in a Figma file
and nothing depends on one. The styleframes are the Remotion `Scene-*`
compositions themselves — open Studio and scrub.

---

## 1 · The premise

One room, one lamp, one material family.

The film is shot on **luminous warm-white mineral paper** with a single key light
fixed at the upper left. Every highlight in every scene runs top-left; every
shadow falls bottom-right; every bevel is bright on the same edge. That
consistency, not any individual effect, is what makes eleven very different
compositions read as one film rather than eleven slides.

Chroma is a **budget, not a decoration**. A frame may spend it on one accent.
Coral is reserved exclusively for failure, so when a starter breaks the eye goes
straight to it without being told.

### What it is not

No dark HUD. No corner brackets, no tiny metadata, no progress bars, no grids, no
glowing central orb, no thin cyan outlines, no dotted lines except the one place
where a dash is load-bearing (an unaccepted suggestion), no interchangeable
rounded rectangles.

---

## 2 · Design tokens — `src/design/`

| File | Owns |
|---|---|
| `colors.ts` | `paper` (4 grounds) · `ink` (5 graphite steps) · `accent` (blue, violet, cyan, amber, coral) · `glass` · `shadow` · `role` semantic map · `alpha()` / `mix()` |
| `typography.ts` | Local OFL fonts (Inter, JetBrains Mono) installed as base64 `@font-face` rules from `fontData.ts`, and a short 11-step scale. Nothing critical below 24px at 1920×1080 |
| `spacing.ts` | 1920×1080 frame · 148px editorial margin · social-safe box (160/120) · 12-column grid (`col`, `span`) · 8px rhythm · radii |
| `lighting.ts` | The fixed key at (470, −160) · `roomBackground()` · `elevation(lift)` two-layer shadows · `bevel()` · `dispersion()` · `bloom()` · `depthOfField(depth)` |
| `materials.ts` | The four glass materials, `glassEdge()`, `sheen()`, `wireframe()`, `well()` |
| `effects.ts` | Fixed-seed grain · vignette · light wipe · bloom veil · chromatic split |

### The four materials

| Material | Uses `backdrop-filter` | Where |
|---|---|---|
| `optical` | yes | Terminal, hero cards, the prism's context, the agent, the League plate — surfaces with real content behind them |
| `solidGlass` | no | Candidate cards, coach rows, the command plate, the bench |
| `lightGlass` | no | Secondary panels |
| `vapor` | no | Background chips and receding objects |

Only `optical` is allowed `backdrop-filter`, and it is used on roughly five
elements per frame. Over a smooth ground the cheaper materials are visually
indistinguishable and composite an order of magnitude faster across 3,480 frames.

---

## 3 · Motion system — `src/motion/`

| File | Owns |
|---|---|
| `easings.ts` | Four named curves — `arrive`, `depart`, `glide`, `snap` — plus `linear` (light travelling a path only) and `drift`. Clamped `interpolate` defaults |
| `springs.ts` | `heavy` (hero mass), `precise` (no overshoot), `quick` (small responses), `lock` (lineup cards) |
| `camera.ts` | One virtual camera: push, pull, lateral drift, rack focus. `cameraAt()` keyframes, `cameraStyle()` with per-depth parallax, `rackFocus()`, `breathe()`. **No shake, ever** |
| `timing.ts` | The single scene table. 60 fps · 3,480 frames · 58.00 s. Also the motion grammar bands, sample frames for QA, and the teaser cut |
| `transitions.ts` | Scene envelope (arrive/depart), the light-wipe schedule, and the reduced strength used at *continuation* boundaries |
| `stagger.ts` | `cascade()`, `step()`, `radial()`, and `HERO_STAGE` — the fixed order every hero object reveals in |

### Motion grammar

| Band | Frames | Used for |
|---|---|---|
| `ui` | 12 | State flips, label swaps, chips settling |
| `reveal` | 20 | One line of copy, one card face |
| `hero` | 34 | A Starting Five card arriving and locking |
| `camera` | 96 | A push, a lateral drift, a rack focus |
| `transition` | 54 | A full scene handoff, wipe included |

### Hero staging order

Every hero object reveals in the same sequence, which is why five different cards
feel like five instances of one object:

```
shell (0) → glyph (+9) → title (+16) → supporting copy (+23) → connection (+30)
```

### Determinism

`Math.random()`, CSS keyframes/transitions, browser timers and recorded footage
are not used anywhere. Scatter comes from a seeded mulberry32 stream
(`src/lib/rng.ts`); every animation is a pure function of `useCurrentFrame()`.

---

## 4 · Component families — `src/components/`

### `ToolObject/` — three classes of "a thing your agent could call"

The classes exist to solve the scale problem honestly: a frame that must say
"hundreds" cannot draw hundreds of readable cards, and a frame that must say
"these five" cannot draw them as anonymous chips.

| Component | Size | Content | Variants | Scenes |
|---|---|---|---|---|
| `BackgroundTool` | 40–84px, depth-scaled | Two abstract rules, no text | driven by `depth` (0 near → 1 far) via `depthOfField()` | 1, 3, 4, 5 |
| `CandidateTool` | 400 × 132 | One glyph, one name, one capability | `idle` · `focus` · `selected` · `rejected` · `failed` · `suggested` · `benched`, plus a `dissolve` 0→1 that cross-fades the body into a wireframe | 3, 5, 6, 9 |
| `HeroTool` | 276–300 wide, 348–424 tall | Custom glyph, `STARTER 01–05`, name, one supporting phrase | tint per position; `startFrame` drives the whole staged entrance | 7, 8, 9 |

`glyphs.tsx` draws all 14 glyphs from one construction — 48×48 box, 2.6px round
strokes, one optional accent shape — so a row of five reads as one designed set.

**Motion:** background tools drift on a seeded sine and never animate in
lockstep. Candidates enter on `arrive` with a small float. Heroes enter rotated
−74° about Y and 320px back in Z, swing to face camera on the `lock` spring, and
flash once as they settle.

### `RosterCore/` — the five-aperture routing prism

Replaces the glowing-orb cliché with an object that *means* something: a
pentagonal optical housing containing five slim light-guides that converge on a
central gate. The five-ness is structural — you can count the starting five in
the mark — and the same geometry becomes the wordmark in the final shot.

| State | Behaviour |
|---|---|
| `idle` | Blades breathe at ~16% on a slow phase offset |
| `listening` | Symmetric pulse, faster |
| `searching` | A single point of light sweeps blade to blade |
| `routing` | One blade at 98%, the rest at 22% |
| `success` | All five warm together |
| `learning` | A violet arc traces the housing |
| `failure` | The active blade turns coral |
| `suggestion` | A sixth aperture docks outside the housing on a stem, dashed until accepted |

Exports `coreAperture()` (blade tips) and `coreEdge(angle)` (housing perimeter,
0° = up, 90° = right) so connections meet the prism at a real feature rather than
at its bounding box. `RosterMark` is the flat graphite version, with stroke
weights specified in rendered pixels so it holds at 26px and at 400px.

### `Connection/` — tapered glass ribbons

Connections are never strokes. A stroked bezier is a uniform hairline that reads
as a wire diagram; a **filled, tapered ribbon** reads as flow. Ribbons are wide
where they leave the prism and narrow where they meet a card, so a still frame
has a direction to read.

| Variant | Colour | Weight | Meaning |
|---|---|---|---|
| `dormant` | graphite hairline | 7 | Present but unused |
| `selected` | blue → violet | 18 | This capability is in the rotation |
| `request` | blue, mid-bulge | 24 | Agent → Roster → capability |
| `return` | cyan, reverse taper | 22 | Result coming back |
| `broken` | coral + tear | 20 | A hard failure; `retract` pulls the far half home |
| `suggested` | violet, dashed | 15 | Offered, not connected — the dash is the meaning |

`ConnectionBundle` draws many faint ribbons converging on one point as a single
translucent mass. That is how Overload says "hundreds of connections" without
drawing hundreds of readable lines.

The id-seed prop is called `trace`, not `id`: it seeds this connection's own
gradient definition and is not a DOM id.

### `SearchSystem/` — the scan

`ScanPlane` is a skewed sheet of light with one hard leading edge.
`scanResolve(x, progress)` returns how far the plane has passed a given x, and
objects read their own substance from it — so the plane visibly *causes* the
evaluation instead of decorating it. `SignalReadout` announces the four ranking
signals one at a time in 52px type.

### `Terminal/` — the glass shell

One sheet of optical glass, warm white, graphite mono, a single hairline rail.
Types `productCopy.LAUNCH_COMMAND` at 2.4 frames per character with a
frame-driven cursor blink, then prints the Day-0 receipt. `lineOpacity` lets the
scene lift individual output lines off the glass as they become objects.

### `BrandReveal/` — the last shot

`Convergence` (five light trails collapsing into the five blade positions),
`MarkArrival`, `Wordmark` (per-letter cascade, no bounce), `CommandPlate` — the
one place in the film that prints the launch command, with its pre-release note.

### `Nodes/` — the agent and the bench

Both are deliberately *not* card-shaped, so a still frame can be read without
labels: `AgentNode` is a wide horizontal slab (a context window has a width
problem, so its object does too) and `BenchShelf` is a low plinth. `SchemaToken`
is the small mono chip a rejected label fragments into.

### `Stage/` and `Type/`

`Stage` owns the room: background, vignette, fixed-seed grain, shared SVG
filters. `Type` owns `Eyebrow`, `Headline`, `Lede`, `AccentRule`, `StateChip` and
the shared `riseIn()` reveal, so no scene writes a font declaration.

---

## 5 · Composition rules enforced in the build

- One obvious focal point per frame; where two ideas must coexist (Coach and
  League) the camera slides between them rather than splitting the frame.
- No critical text under 24px at 1920×1080; eyebrows bottom out at 22px only
  where they repeat something the frame already shows.
- No important stroke under 2px. `glassEdge` is 1.6–2px, `AccentRule` is 3px, the
  ribbon centre-line highlight has a 1.6px floor.
- Never more than five fully-detailed tool objects on screen at once.
- All load-bearing material inside the 160/120 social-safe box (verified on the
  QA sheet).
- No text/card overlaps at any inspected frame (33 frames inspected per pass).
- Every decorative element has a narrative job; several were deleted during QA
  precisely because they did not.

---

## 6 · Where things live

```
src/
  productCopy.ts        every word on screen, with its source
  LaunchFilm.tsx        the eleven scenes + score + light wipes
  Root.tsx              compositions: LaunchFilm, Teaser, Poster, Scene-*, QA sheets
  design/               colours, typography, spacing, materials, lighting, effects
  motion/               easings, springs, camera, timing, transitions, stagger
  lib/                  rng, geometry (ribbons, polygons), world (shared staging)
  audio/cues.ts         the cue table the WAV synthesiser reads
  components/           ToolObject · RosterCore · Connection · SearchSystem ·
                        Terminal · BrandReveal · Stage · Type · Nodes
  scenes/               S01…S11 + SceneShell
  qa/                   contact/before-after/QA sheets + the rejected-direction reference
```
