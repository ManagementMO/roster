"""Export this logo concept as portable SVG lockups and transparent PNGs.

Run: uv run --with 'fonttools[woff]' --with uharfbuzz --with cairosvg python build_assets.py
On Homebrew macOS, prefix with DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib.
The AI-generated explorations remain unchanged. This script renders the
separately drawn vector geometry and outlines the existing Space Grotesk font.
"""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import re

import cairosvg
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

BASE = Path(__file__).resolve().parent
MASTER = BASE / "roster-mark-cobalt.svg"
source = MASTER.read_text()
colors = {"cobalt": "#4963DF", "ink": "#172033", "pearl": "#F7F8FC"}
geometry = re.search(r'<g id="roster-mark">(.*?)</g>', source, re.S).group(1)

for label, color in colors.items():
    svg = source.replace("#4963DF", color)
    (BASE / f"roster-mark-{label}.svg").write_text(svg)
    for size in [256, 512, 1024]:
        cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size,
                        write_to=str(BASE / f"roster-mark-{label}-{size}.png"))

favicon = source.replace('fill="#4963DF"', 'fill="#F7F8FC"').replace(
    '<g id="roster-mark">',
    '<rect width="256" height="256" rx="56" fill="#4963DF"/><g id="roster-mark">',
)
(BASE / "roster-favicon.svg").write_text(favicon)
for size in [16, 32, 48, 180, 512]:
    cairosvg.svg2png(bytestring=favicon.encode(), output_width=size, output_height=size,
                    write_to=str(BASE / f"roster-icon-{size}.png"))

# The website uses cobalt on pearl, including its browser and touch icons.
# Keep the inverse cobalt app tile as a separate, reusable application.
pearl_favicon = source.replace(
    '<g id="roster-mark">',
    '<rect width="256" height="256" rx="56" fill="#F7F8FC"/><g id="roster-mark">',
)
(BASE / "roster-favicon-pearl.svg").write_text(pearl_favicon)
for size in [16, 32, 48, 180, 512]:
    cairosvg.svg2png(bytestring=pearl_favicon.encode(), output_width=size, output_height=size,
                    write_to=str(BASE / f"roster-icon-pearl-{size}.png"))

# Shape the actual local font, including its kerning, before converting every
# glyph to paths. The exported wordmark therefore has no font dependency.
font = TTFont(BASE / "fonts/SpaceGrotesk-Variable.woff2")
font = instantiateVariableFont(font, {"wght": 700}, inplace=False)
font.flavor = None
ttf = BytesIO()
font.save(ttf)
face = hb.Face(ttf.getvalue())
shaper = hb.Font(face)
shaper.scale = (face.upem, face.upem)
buffer = hb.Buffer()
buffer.add_str("oster")
buffer.guess_segment_properties()
hb.shape(shaper, buffer, {"kern": True})
glyphs = font.getGlyphSet()
order = font.getGlyphOrder()
scale = 292 / face.upem
tracking = -6
# The approved symbol is the initial letter, not a separate badge beside an R.
# Scale the complete five-piece group uniformly to the font's cap height and
# baseline. Its native component geometry and longer legs remain untouched.
baseline = 232
cap_pen = BoundsPen(glyphs)
glyphs["R"].draw(cap_pen)
mark_scale = cap_pen.bounds[3] * scale / 228
mark_x = 24 - 40 * mark_scale
mark_y = baseline - 242 * mark_scale
first_pen = BoundsPen(glyphs)
glyphs[order[buffer.glyph_infos[0].codepoint]].draw(first_pen)
x = 24 + 175 * mark_scale + 18 - first_pen.bounds[0] * scale
paths = []
for glyph, pos in zip(buffer.glyph_infos, buffer.glyph_positions):
    pen = SVGPathPen(glyphs)
    glyphs[order[glyph.codepoint]].draw(pen)
    paths.append(f'<path transform="translate({x + pos.x_offset * scale:.4f} '
                 f'{232 - pos.y_offset * scale:.4f}) scale({scale:.7f} {-scale:.7f})" '
                 f'd="{pen.getCommands()}"/>')
    x += pos.x_advance * scale + tracking
width = round(x - tracking + 24, 3)
for label, color in colors.items():
    mark_color = "#4963DF" if label == "cobalt" else color
    text_color = "#172033" if label == "cobalt" else color
    lockup = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 256" '
              f'role="img" aria-labelledby="title"><title id="title">Roster</title>'
              f'<g id="roster-initial" fill="{mark_color}" transform="translate({mark_x:.6f} {mark_y:.6f}) scale({mark_scale:.9f})">{geometry}</g>'
              f'<g id="roster-letters" fill="{text_color}">{"".join(paths)}</g></svg>\n')
    (BASE / f"roster-lockup-{label}.svg").write_text(lockup)
    cairosvg.svg2png(bytestring=lockup.encode(), output_width=round(width * 2),
                    output_height=512, write_to=str(BASE / f"roster-lockup-{label}.png"))

# A presentation of the finished vector asset, separate from the original
# image-generation boards. The background is intentional for this one image.
lockup_body = re.sub(r'^<svg[^>]*>|</svg>\s*$', '', (BASE / 'roster-lockup-cobalt.svg').read_text())
board = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="980" viewBox="0 0 1600 980">'
         '<rect width="1600" height="980" fill="#F7F8FC"/>'
         '<text x="100" y="82" fill="#657087" font-family="sans-serif" font-size="16" letter-spacing="3">ROSTER / IDENTITY 01</text>'
         f'<svg x="160" y="215" width="1280" height="274" viewBox="0 0 {width} 256">{lockup_body}</svg>'
         '<path d="M100 588H1500" stroke="#DCE2ED"/>'
         '<text x="100" y="642" fill="#657087" font-family="sans-serif" font-size="16" letter-spacing="2">FIVE PARTS. ONE ROSTER.</text>')
for x, background, foreground in [(100, '#FFFFFF', '#172033'), (574, '#151B29', '#F7F8FC'), (1048, '#4963DF', '#F7F8FC')]:
    board += (f'<rect x="{x}" y="688" width="452" height="212" rx="18" fill="{background}"/>'
              f'<svg x="{x+161}" y="727" width="132" height="132" viewBox="0 0 256 256" fill="{foreground}">{geometry}</svg>')
board += '</svg>\n'
(BASE / 'roster-identity-preview.svg').write_text(board)
cairosvg.svg2png(bytestring=board.encode(), write_to=str(BASE / 'roster-identity-preview.png'))

files = sorted([*BASE.glob("*.svg"), *BASE.glob("*.png")])
manifest = {"concept": "Roster five-part R / 01 slim", "geometryPieces": 5,
            "wordmark": "Five-part R initial plus Space Grotesk 700 oster, shaped and outlined", "files": [
                {"path": p.name, "bytes": p.stat().st_size,
                 "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(BASE / "asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
(BASE / "wordmark-layout.json").write_text(json.dumps({
    "revision": "02-unified-wordmark", "text": "Roster", "outlinedLetters": "oster",
    "viewBox": [0, 0, width, 256], "baseline": baseline,
    "initialTransform": {"x": mark_x, "y": mark_y, "scale": mark_scale},
    "initialGeometry": "roster-mark-cobalt.svg", "initialPieces": 5,
    "initialToLetterGap": 18, "fontWeight": 700,
}, indent=2) + "\n")
print(f"Exported {len(files)} vector and PNG assets. Outlined lockup: {width} × 256.")
