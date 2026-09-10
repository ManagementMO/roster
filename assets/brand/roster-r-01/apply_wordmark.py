"""Apply the canonical unified wordmark to the film and identity motion board.

Run after build_assets.py, then rebuild the feed edition and import website assets.
Only the R group moves in the film; its five native component paths stay exact.
"""
from pathlib import Path
from html import escape
import json
import re
import shutil
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
ET.register_namespace("", "http://www.w3.org/2000/svg")
PARTS = ["upper-stem", "upper-bowl", "lower-bowl", "lower-stem", "outgoing-leg"]


def inline_wordmark(prefix, root_id, animated_board=False, previous=None):
    svg = ET.fromstring((BASE / "roster-lockup-pearl.svg").read_text())
    svg.attrib.pop("aria-labelledby", None)
    svg.set("aria-label", "Roster")
    svg.set("id", root_id)
    if animated_board:
        svg.set("class", "film-wordmark")
    for element in svg.iter():
        old_id = element.get("id")
        if old_id in PARTS:
            element.set("id", f"{prefix}-{old_id}")
            if animated_board:
                i = PARTS.index(old_id)
                dx, dy = [(-18, 0), (0, -18), (18, 0), (-10, 16), (16, 16)][i]
                element.set("class", "piece")
                element.set("style", f"--delay:{i * .045:.3f}s;--dx:{dx}px;--dy:{dy}px;--rot:0deg")
        elif old_id in ["roster-initial", "roster-letters", "title"]:
            element.set("id", f"{prefix}-{old_id}")
            if animated_board and old_id == "roster-letters":
                element.set("class", "word")
    markup = ET.tostring(svg, encoding="unicode")
    if previous is not None:
        # Keep Studio's stable selections when canonical outlines are reimported.
        # Named pieces match by id; anonymous letter paths match by geometry.
        def identity(element):
            if element.get("id"):
                return ("id", element.get("id"))
            return (element.tag, element.get("d"), element.get("transform"))

        identifiers = {identity(element): element.get("data-hf-id")
                       for element in ET.fromstring(previous).iter()
                       if element.get("data-hf-id")}
        elements = iter(svg.iter())

        def restore_identifier(match):
            identifier = identifiers.get(identity(next(elements)))
            return match[0] + (f' data-hf-id="{escape(identifier, quote=True)}"' if identifier else "")

        markup = re.sub(r"<[A-Za-z][\w:-]*(?=[\s>])", restore_identifier, markup)
    return markup


wide = REPO / "videos/roster-premiere-tight"
for edition in [wide, REPO / "videos/roster-premiere-feed"]:
    shutil.copyfile(BASE / "roster-lockup-pearl.svg", edition / "assets/roster-wordmark-pearl.svg")

scene = wide / "compositions/frames/06-identity.html"
html = scene.read_text()
old_pair = r'<svg\b[^>]*id="s06-mark"[\s\S]*?</svg>\s*<img\b[^>]*id="s06-word"[^>]*>'
current = r'<svg\b[^>]*id="s06-word"[^>]*>[\s\S]*?</svg>'
pattern = old_pair if re.search(old_pair, html) else current
html, count = re.subn(pattern, lambda match: inline_wordmark(
    "s06", "s06-word", previous=match[0] if pattern == current else None), html, count=1)
assert count == 1, "Expected one closing wordmark placement."
scene.write_text(html)

board = BASE / "index.html"
html = board.read_text()
pattern = r'(<div class="film-brand">)[\s\S]*?(</div><div class="film-rule">)'
html, count = re.subn(pattern, lambda match: match[1] + inline_wordmark("board", "film-wordmark", True) + match[2], html, count=1)
assert count == 1, "Expected one identity-board motion placement."
board.write_text(html)
# The League pages are self-contained HTML. Embed the canonical outlines so
# opening a generated page needs no image request or installed font.
league_svg = (BASE / "roster-lockup-pearl.svg").read_text().strip()
league_svg = league_svg.replace('aria-labelledby="title"', 'aria-label="Roster"')
league_svg = league_svg.replace('id="roster-initial" fill="#F7F8FC"',
                                'id="roster-initial" fill="var(--wordmark-initial, currentColor)"')
league_svg = league_svg.replace('fill="#F7F8FC"', 'fill="currentColor"')
league_svg = re.sub(r' id="[^"]+"', '', league_svg)
(REPO / "apps/league/src/brand.ts").write_text(
    "// Generated from assets/brand/roster-r-01/roster-lockup-pearl.svg by apply_wordmark.py.\n"
    + "export const ROSTER_WORDMARK = " + json.dumps(league_svg) + ";\n"
)
print("Applied the unified wordmark to the films, motion board, and self-contained League header.")
