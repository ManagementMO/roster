"""Freeze a small CC0 recorded-instrument palette, not complete sample libraries."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/audio/samples"
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "guitar": "sfzinstruments/karoryfer.black-and-green-guitars",
    "bass": "sfzinstruments/karoryfer.black-and-blue-basses",
    "drums": "sfzinstruments/karoryfer.big-rusty-drums",
}
trees = {name: json.loads((ROOT / f"verification/{name}-source-tree.json").read_text()) for name in SOURCES}
paths = {name: {entry["path"]: entry for entry in tree["tree"]} for name, tree in trees.items()}
requests = []

def want(kind, source, name, **metadata):
    assert source in paths[kind], source
    requests.append({"kind": kind, "source": source, "name": name, "gitBlob": paths[kind][source]["sha"], **metadata})

# These libraries name middle C c5; the SFZ map confirms e3 is MIDI 40.
notes = [41, 43, 45, 48, 50, 52, 53, 55, 57, 60, 62, 64, 65, 67, 69, 72, 74, 76]
pitch = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"]
for instrument in ["green", "black"]:
    for midi in notes:
        note = pitch[midi % 12] + str(midi // 12)
        for rr in [1, 2]:
            source = f"Samples/{instrument}/ord/twang_{note}_f_rr{rr}.wav"
            want("guitar", source, f"{instrument}-{midi}-{rr}.wav", midi=midi, instrument=instrument, variation=rr)
for midi in [29, 31, 33, 36]:
    note = pitch[midi % 12] + str(midi // 12)
    for rr in [1, 2]:
        want("bass", f"Samples/darkblack/reg/darkblack_{note}_f_rr{rr}.wav", f"bass-{midi}-{rr}.wav", midi=midi, variation=rr)

drums = {
    "kick": "Samples/kick_24/kick/kick/k_vl4_rr{rr}.flac",
    "snare": "Samples/snare_14/rimshot/top/sn_rs_vl4_rr{rr}.flac",
    "snare-room": "Samples/snare_14/rimshot/oh/sn_rs_vl4_rr{rr}.flac",
    "hat": "Samples/hihat_14/cl/cl/hh_cl_vl3_rr{rr}.flac",
    "open-hat": "Samples/hihat_14/ho/cl/hh_ho_vl3_rr{rr}.flac",
    "crash": "Samples/crash_17/cr/cl/cr_vl4_rr{rr}.flac",
    "tom-high": "Samples/tom_14/center/cl/t14_vl4_rr{rr}.flac",
    "tom-low": "Samples/tom_18/center/cl/t18_vl4_rr{rr}.flac",
}
for name, template in drums.items():
    for rr in [1, 2]:
        source = template.format(rr=rr)
        if source not in paths["drums"]:
            folder = source.rsplit("/", 1)[0] + "/"
            choices = [p for p in paths["drums"] if p.startswith(folder) and p.endswith(f"vl4_rr{rr}.flac")]
            if not choices:
                choices = [p for p in paths["drums"] if p.startswith(folder) and p.endswith(f"vl3_rr{rr}.flac")]
            assert len(choices) == 1, (source, choices)
            source = choices[0]
        want("drums", source, f"{name}-{rr}.flac", instrument=name, variation=rr)

def fetch(item):
    url = f"https://raw.githubusercontent.com/{SOURCES[item['kind']]}/main/{item['source']}"
    destination = OUT / item["name"]
    if not destination.exists():
        subprocess.run(["curl", "-fsSL", "--retry", "2", url, "-o", str(destination)], check=True)
    data = destination.read_bytes()
    assert data[:4] in [b"RIFF", b"fLaC"], (item["name"], data[:4])
    return {**item, "url": url, "path": str(destination.relative_to(ROOT)), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    assets = list(pool.map(fetch, requests))
for kind, repo in SOURCES.items():
    license_name = "license" if kind == "bass" else "LICENSE"
    subprocess.run(["curl", "-fsSL", f"https://raw.githubusercontent.com/{repo}/main/{license_name}", "-o", str(OUT / f"{kind}-CC0.txt")], check=True)
report = {"license": "CC0-1.0", "publisherLicensePage": "https://shop.karoryfer.com/pages/free-samples", "sources": SOURCES, "assets": assets}
(OUT / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Froze {len(assets)} recorded one-shot samples ({sum(a['bytes'] for a in assets)/1e6:.1f} MB); source URLs, licenses and hashes saved.")
