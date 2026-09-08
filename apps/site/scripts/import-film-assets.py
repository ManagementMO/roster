import hashlib
import json
import shutil
import sys
from pathlib import Path

source = Path(sys.argv[1])
identity = Path(sys.argv[2]) if len(sys.argv) > 2 else source.parents[2] / "assets/brand/roster-r-01"
public = Path(__file__).resolve().parents[1] / "public"
public.mkdir(exist_ok=True)
manifest = []


def copy(relative, destination, license_name):
    target = public / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / relative, target)
    manifest.append({
        "asset": destination,
        "source": "videos/roster-premiere-tight/assets/" + relative,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "license": license_name,
    })


for name, license_name in [("SpaceGrotesk", "SPACE-GROTESK"), ("Manrope", "MANROPE"), ("JetBrainsMono", "JETBRAINS-MONO")]:
    copy(name + "-Variable.woff2", "fonts/" + name + ".woff2", "SIL OFL 1.1; licenses/" + license_name + "-LICENSE.txt")
    copy(license_name + "-LICENSE.txt", "licenses/" + license_name + "-LICENSE.txt", "SIL OFL 1.1")

brand_sources = {
    "github": "https://cdn.jsdelivr.net/npm/simple-icons@16.21.0/icons/github.svg",
    "github-light": "https://cdn.jsdelivr.net/npm/simple-icons@16.21.0/icons/github.svg",
    "playwright": "https://raw.githubusercontent.com/microsoft/playwright/main/packages/recorder/public/playwright-logo.svg",
    "linear-color": "https://cdn.jsdelivr.net/npm/simple-icons@16.21.0/icons/linear.svg",
    "figma": "https://svgl.app/library/figma.svg",
    "slack": "https://svgl.app/library/slack.svg",
    "supabase": "https://svgl.app/library/supabase.svg",
    "postgresql": "https://svgl.app/library/postgresql.svg",
    "brave": "https://brave.com/static-assets/images/brave-logo-sans-text.svg",
}
for name, upstream in brand_sources.items():
    license_name = "Apache-2.0; PLAYWRIGHT-LICENSE.txt" if name == "playwright" else "Upstream artwork and vendor trademark terms; identification only, not endorsement. Simple Icons geometry is CC0."
    copy("brands/" + name + ".svg", "brands/" + name + ".svg", license_name)
    manifest[-1]["upstream"] = upstream

shutil.copyfile(public.parent / "node_modules/@playwright/test/LICENSE", public / "licenses/PLAYWRIGHT-LICENSE.txt")
manifest.append({"asset": "Inline interface icons", "source": "@iconify-json/tabler@1.2.38", "upstream": "https://github.com/tabler/tabler-icons", "license": "MIT; TABLER-LICENSE.txt"})

# Import canonical vectors directly. Tracing the old bitmap would restore
# the obsolete symbol and lose the refined five-part geometry.
for original, destination in [
    ("roster-mark-cobalt.svg", "mark-cobalt.svg"),
    ("roster-mark-ink.svg", "mark-ink.svg"),
    ("roster-mark-pearl.svg", "mark-white.svg"),
    ("roster-lockup-cobalt.svg", "roster-lockup-cobalt.svg"),
    ("roster-lockup-pearl.svg", "roster-lockup-pearl.svg"),
    ("roster-favicon-pearl.svg", "favicon.svg"),
]:
    target = public / destination
    shutil.copyfile(identity / original, target)
    manifest.append({
        "asset": destination,
        "source": "assets/brand/roster-r-01/" + original,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "method": "Canonical slim five-part SVG, copied without changing geometry.",
        "license": "Owner-approved Roster identity. Outlined Space Grotesk uses SIL OFL 1.1.",
    })

current_color = (identity / "roster-mark-cobalt.svg").read_text().replace('fill="#4963DF"', 'fill="currentColor"')
(public / "mark.svg").write_text(current_color)
manifest.append({"asset": "mark.svg", "source": "assets/brand/roster-r-01/roster-mark-cobalt.svg", "sha256": hashlib.sha256(current_color.encode()).hexdigest(), "method": "Canonical slim vector; only the fill becomes currentColor.", "license": "Owner-approved Roster identity."})
(public / "licenses" / "assets.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"assets": len(manifest), "mark_viewbox": "0 0 256 256", "components": 5, "identity": "01-slim"}))
