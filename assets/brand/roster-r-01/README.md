# Roster — unified five-part R wordmark

The Roster logo reads **Roster once**: the unique five-part R is the initial letter, followed by the outlined letters **oster**. There is no separate badge next to another capital R. Created and optically refined September 8, 2026, the five-part mark connects to the product's starting-five idea and the direction of a routed call. Five is a brand metaphor; the product's configurable limit remains unchanged.

The symbol retains the approved 40-unit stems, open gaps, 80-unit lower stem and extended diagonal, centered in the same 256×256 grid. In the wordmark, the whole symbol is scaled uniformly to the Space Grotesk cap height and aligned to the lettering baseline. The five remaining letters retain the same Space Grotesk 700 outlines. The unified wordmark uses a 926.258×256 viewBox and an 18-unit optical gap before the o. Earlier identities are preserved in ignored verification backups.

## Preview

Open `index.html` through a local static server. The current review server is `http://127.0.0.1:51116/`.

The interactive board includes three background choices, a website-header application, a launch-card motion test, actual 16/24/32/48/64px symbols, and single-color applications. The identity is applied to both current 15-second films and the website. See `ADOPTION.md` for the live preview locations, delivery paths and verification boundary. Earlier identity versions and pre-adoption video sources are preserved in verification backups.

`roster-identity-preview.png` is a clean, shareable overview of the finished vector direction. `roster-identity-kit.zip` bundles the assets, source, preview and provenance.

## Assets

| Use | File |
| --- | --- |
| Primary symbol on light surfaces | `roster-mark-cobalt.svg` |
| Single-color dark symbol | `roster-mark-ink.svg` |
| Reversed symbol on dark surfaces | `roster-mark-pearl.svg` |
| Primary horizontal logo and wordmark | `roster-lockup-cobalt.svg` |
| Dark horizontal logo and wordmark | `roster-lockup-ink.svg` |
| Reversed horizontal logo and wordmark | `roster-lockup-pearl.svg` |
| Website favicon, cobalt on pearl | `roster-favicon-pearl.svg` |
| Inverse app favicon, pearl on cobalt | `roster-favicon.svg` |
| Website touch/icon raster sizes | `roster-icon-pearl-{16,32,48,180,512}.png` |
| App/avatar raster sizes | `roster-icon-16.png`, `-32`, `-48`, `-180`, `-512` |
| Transparent symbol raster sizes | `roster-mark-{cobalt,ink,pearl}-{256,512,1024}.png` |
| Large transparent horizontal logos | `roster-lockup-{cobalt,ink,pearl}.png` |

Every SVG is a real vector. All three horizontal SVGs contain outlined letter shapes and need no font installation. The nine standalone mark PNGs have verified alpha channels. The contained icons have intentional pearl or cobalt rounded-square fields, with transparent outer corners. The overview PNG has an intentional pearl background.

## Visual rules

- Cobalt `#4963DF` is the primary mark color on pearl `#F7F8FC` or white.
- Ink `#172033` is the dark monochrome version; navy `#151B29` is the film background.
- Use the pearl mark on navy or cobalt. Keep all five components the same color.
- Preserve the mark's proportions, corner geometry and open gaps. The master uses a 256×256 viewBox with internal clear space.
- Use the complete unified wordmark in headers, docs, router nameplates, end cards and launch covers. Never append another spelled-out Roster to it.
- Use the standalone five-part R for icon-only placements such as favicons, touch icons and compact semantic diagram nodes.
- Vendor logos and semantic outcome colors remain independent of Roster's brand color.
- The motion test assembles the five components with staggered arrivals and a restrained overshoot, then becomes still. The browser's reduced-motion setting disables the entrance animation.

The canonical editable symbol is `roster-mark-cobalt.svg`. `build_assets.py` derives the colorways, transparent PNGs, contained icons, unified wordmarks, layout metadata and static overview. `apply_wordmark.py` imports the pearl wordmark into the film assets, animated closing scene, identity motion board and self-contained League header. Run that import script from its location inside the repository. `index.html` contains the interactive presentation.

## Source and provenance

The concept was explored with the built-in ChatGPT image generation tool. Exact prompts are in `explorations/prompts.json`; both generated images are preserved unchanged beside that file. The first generated board included atmospheric glow. The standalone generated reference included a painted checkerboard, so it is an exploration image rather than a transparent logo asset.

The final reusable geometry was constructed separately as five SVG components, with controlled gaps, smooth joins, exact colors and true transparency. The root-level SVG and PNG files are the assets to use.

Typography follows the film's existing Space Grotesk direction. Horizontal logos use Space Grotesk at weight 700, shaped with kerning and converted to paths. The browser presentation uses the existing local Manrope and JetBrains Mono files as well. Font license files are included under `fonts/`; their upstream sources are:

- https://github.com/google/fonts/tree/main/ofl/spacegrotesk
- https://github.com/google/fonts/tree/main/ofl/manrope
- https://github.com/google/fonts/tree/main/ofl/jetbrainsmono

The design brief was grounded in `README.md`, the router's `DRAFT_TOOL` and `CALL_TOOL` contracts, the finished launch-film assets, and the website direction in `WEBSITE-AND-DOCS-PROMPT.md`.

## Rebuild and verification

```sh
uv run --with 'fonttools[woff]' --with uharfbuzz --with cairosvg python build_assets.py
python3 apply_wordmark.py
```

On Homebrew macOS, use `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` before that command so Cairo's installed shared library can be found. This affects only the command's environment.

`asset-manifest.json` records the 32 exported SVG/PNG files and their hashes. `wordmark-layout.json` records the baseline, scale and optical spacing. `verification.json` records the unchanged five-component symbol and the five outlined suffix letters. Current adoption and validation details are in `ADOPTION.md`.
