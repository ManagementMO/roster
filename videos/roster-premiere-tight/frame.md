# Roster launch film — approved design system

This file describes the current 15-second pearl-and-cobalt edit. It supersedes the earlier coral preset and its monochrome restrictions. The user explicitly approved natural vendor colors, vibrant distinctive illustrations, modern flat capability icons, and the recommended cool palette.

## Palette and materials

| Role | Value | Application |
| --- | --- | --- |
| Pearl | #F7F8FC | Light canvas and reversed typography |
| Ink | #172033 | Display type and labels on light surfaces |
| Navy | #151B29 | Opening, call and closing backgrounds; product panels |
| Cobalt | #4963DF | FIVE, active edges, connectors and NEXT DRAFT |
| Pale blue | #DFE7FB | Task input and selected tool |
| Cobalt on navy | #899BF4 / #AEBEFF | Fine accents / readable API syntax |
| Soft white | #FDFDFC | Capability cards |

The second, third and fifth scenes use the same restrained radial background: `radial-gradient(ellipse at 88% 15%, #DCE6F9 0%, #EDF1FA 32%, #F7F8FC 72%)`. No animated color wash, decorative glare, texture or neon treatment. Light cards have a fine cool border and subtle shadow; primary surfaces have 24px corners.

Full-color vendor artwork remains untouched: Playwright red/green, Figma multicolor, Linear violet, and appropriate GitHub light/dark assets. Capability icons retain blue, gold, teal, violet and indigo two-tone geometry on their shared 44px grid. The teal-blue database and green/coral/amber outcomes retain their established colors. Do not add grayscale filters, masks, bevels or shine strokes to these icons.

## Typography and composition

Final polish: primary draft-row labels and returned-result text are 48px, increased from 40px. Match the handoff title at 48px / 58px line height and 9.5px top inset. The closing descriptor is “Your local MCP tool router.” at 50px. Its GitHub URL uses 48px / 64px, weight 500, and arrives over local 0.48–0.71s. The final reading hold is 2.1025 seconds; the motion assertion explicitly allows 2.2 seconds for that planned still.

The opening has exactly eight unique vendor marks: GitHub, Linear, Playwright, Figma, Brave, Slack, PostgreSQL and Supabase. Each appears on only one tile in this scene. Keep the original multicolor Slack symbol, green Supabase bolt, blue PostgreSQL elephant and orange Brave lion; use no monochrome substitute. Brand artwork remains proportional inside the existing tile geometry.

Retain Space Grotesk for large type, Manrope for labels, and JetBrains Mono for API text. All fonts are local. Preserve the six existing compositions, large headline geometry, 1920×1080 canvas and exact 15-second duration. Keep the small white Roster mark on an ink plate in the light second scene. End on the white mark, Roster, tagline and GitHub URL; the closing release-status line stays removed.

## Motion

Use a paused, seekable GSAP timeline per composition and one master timeline. Short arrivals decelerate into reading holds. Keep original beat times, 120 fps rendering and the 60 fps sharing copy. The master owns scene transitions. Animate transforms, not layout dimensions or clip lifecycle.

During the selection, soften unselected labels while keeping icons at full saturation. Preserve the settled selection hold from global 6.65 to 7.10 seconds. The master then takes over the selected row at (812,574): a single card and proportionally scaled Playwright logo move to (1434,412), settling at 8.20 seconds. The user-requested softer landing uses a 18px horizontal overshoot, a 1.7-degree tilt and two diminishing rebounds; vertical movement leads slightly to curve the flight. Uniform scale stays within 1.75% of the original size, preserving artwork proportions. Other candidates recede before the card crosses them. The destination takes over at 8.225 seconds, after a three-frame stationary hold. The request still arrives at 8.35 seconds. Surface corners compensate for nonuniform scaling; type and logo have independent transforms. Verify both ownership boundaries and the cut at 7.50 seconds.

Retain the short matched leftward cuts at the other scene boundaries and the final inverse zoom. No idle loops, stock elastic eases, stock transitions, blur or added visual noise. The explicit user request authorizes the restrained Playwright rebound; other scene entrances keep their existing motion. Keep the existing original Full Send pop-rock score and all cue times.

## Verification

The user approved an original dry Playwright landing sound at 8.20s and a restrained 1.2dB guitar dip. The final score is `assets/audio/full-send-final.wav`; earlier filenames remain aliases. The original drum and bass stems remain byte-identical. The separate 4:5 composition lives in `../roster-premiere-feed/` and has its own layout spec, carrier geometry, checks and exports.

Inspect actual encoded frames as well as Studio. Check the light scenes, selected-row handoff, destination takeover and final identity. Run HyperFrames check, the seam gate, native-rate render and encoded-media delivery audit. Keep the preceding approved edit in `verification/before-pearl-cobalt/`. Scope remains this production folder, with no product-source changes or publication.
