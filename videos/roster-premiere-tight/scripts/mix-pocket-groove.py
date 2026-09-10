"""Fit a selected jazzy catalog groove and original product sounds to picture.

The frozen FLAC is a 16-second excerpt of the source recording. Only a 2.4%
tempo adjustment is needed for the film's 128 BPM grid; pitch stays unchanged.
Music and sound design remain separate editable stems before final mastering.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import numpy as np
import scipy
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/audio"
STEMS = OUT / "pocket-groove-stems"
STEMS.mkdir(exist_ok=True)
SR, DURATION = 48000, 15.0
N = int(SR * DURATION)
SOURCE = OUT / "pocket-groove-source.flac"
RNG = np.random.default_rng(202609081)
events = []


def ffmpeg(args):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-y", *args],
                            capture_output=True, check=True)
    return result


def filt(sound, frequency, kind="lowpass"):
    return sosfilt(butter(2, frequency, btype=kind, fs=SR, output="sos"), sound, axis=0)


decoded = ffmpeg(["-i", str(SOURCE), "-af", "atempo=1.024", "-t", "15",
                  "-ar", str(SR), "-ac", "2", "-f", "f32le", "-"]).stdout
music = np.frombuffer(decoded, dtype="<f4").reshape(-1, 2).astype(np.float64)
assert len(music) >= N, "The source must cover the complete picture edit."
music = music[:N]
music = filt(music, 30, "highpass")
music *= .145 / np.sqrt(np.mean(music ** 2))
design = np.zeros_like(music)


def sound_clock(seconds):
    return np.arange(round(SR * seconds)) / SR


def place(at, sound, gain, pan, name):
    offset = round(at * SR)
    count = min(len(sound), N - offset)
    angle = (pan + 1) * np.pi / 4
    stereo = sound[:count, None] * np.array([np.cos(angle), np.sin(angle)])
    design[offset:offset + count] += stereo * gain
    events.append({"seconds": at, "name": name, "gain": gain, "pan": pan})


def pop(body=620, duration=.065):
    t = sound_clock(duration)
    phase = 2 * np.pi * body * (.75 * t + .25 * .009 * (1 - np.exp(-t / .009)))
    tone = np.sin(phase) * np.exp(-t / .014)
    noise = filt(RNG.standard_normal(len(t)), [950, 3600], "bandpass")
    sound = .76 * tone + .12 * noise * np.exp(-t / .003)
    return sound * np.clip(t / .0012, 0, 1) * np.clip((duration - t) / .008, 0, 1)


def swish(duration=.19):
    t = sound_clock(duration)
    noise = filt(RNG.standard_normal(len(t)), [700, 7800], "bandpass")
    return noise * np.sin(np.pi * t / duration) ** 2


def bell(frequency, duration=.28):
    t = sound_clock(duration)
    sound = np.sin(2 * np.pi * frequency * t)
    sound += .13 * np.sin(2 * np.pi * frequency * 2.004 * t) * np.exp(-t / .045)
    return sound * np.exp(-t / .072) * np.clip(t / .002, 0, 1)


def duck(at, before=.018, release=.12, db=1.8):
    t = np.arange(N) / SR
    envelope = np.minimum(np.clip((t - at + before) / before, 0, 1),
                          np.clip((at + release - t) / release, 0, 1))
    envelope = envelope ** 2 * (3 - 2 * envelope)
    music[:] *= 10 ** (-db * envelope[:, None] / 20)


# Small pops follow the original distinct card arrivals, not every drum hit.
for i, at in enumerate([.08, .17, .25, .34, .43, .51, .60, .68]):
    place(at, pop(490 + i * 23), .031, -.32 + i * .09, "opening card pop")
for i, offset in enumerate([.18, .26, .33, .39, .44]):
    place(1.875 + offset, pop(570 + i * 35), .039, -.3 + i * .15, "starting-five card")
for at in [1.875, 3.75, 7.5, 10.3125, 12.1875]:
    place(at - .19, swish(), .053 if at < 12 else .069, -.06, "short scene swish")
place(4.57, pop(540, .075), .073, -.12, "draft submitted")
for i, at in enumerate([5.20, 5.31, 5.41, 5.50, 5.58]):
    place(at, pop(590 + i * 24), .027, .06 + i * .035, "draft row arrival")
place(6.35, pop(710), .077, .12, "Playwright selected")
place(7.12, swish(.24), .024, .22, "Playwright lift")
place(8.20, pop(660, .048), .12, .28, "Playwright settled contact")
duck(8.20, release=.10, db=1.8)
place(8.35, pop(810, .04), .054, .3, "request sent")
place(9.05, bell(783.99, .22), .047, -.12, "snapshot returned")
place(9.12, bell(1046.5, .20), .032, .08, "snapshot response tail")
duck(9.05, db=1.0)
for i, at in enumerate([10.5125, 10.6325, 10.7425, 11.1325]):
    place(at, pop(540 + i * 50), .038, -.18 + i * .10, "local outcome recorded")

# A rounded, quiet logo accent; no trailer boom or bright cymbal wash.
t = sound_clock(.34)
logo_body = np.sin(2 * np.pi * 98 * t) * np.exp(-t / .075) * np.clip(t / .003, 0, 1)
place(12.1875, logo_body, .065, 0, "rounded logo arrival")
place(12.1875, bell(523.25, .40), .044, -.16, "logo C chime")
place(12.2675, bell(783.99, .34), .032, .18, "logo G chime")
duck(12.1875, before=.045, release=.16, db=1.3)

# End on the readable brand hold with an intentional musical release.
fade_in = round(.004 * SR)
music[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
fade_start = round(14.18 * SR)
music[fade_start:] *= np.cos(np.linspace(0, np.pi / 2, N - fade_start))[:, None] ** 1.45
design[-round(.05 * SR):] *= np.linspace(1, 0, round(.05 * SR))[:, None]
mix = music + design
assert np.isfinite(mix).all() and mix.shape == (720000, 2)
for name, stem in [("music", music), ("design", design), ("mix", mix)]:
    wavfile.write(STEMS / f"{name}.wav", SR, stem.astype(np.float32))


def measurement(stderr):
    text = stderr.decode()
    start = text.rfind('{\n')
    return json.JSONDecoder().raw_decode(text[start:])[0]


source_mix = str(STEMS / "mix.wav")
first = measurement(ffmpeg(["-i", source_mix, "-af",
                           "loudnorm=I=-14:TP=-2:LRA=7:print_format=json", "-f", "null", "-"]).stderr)
normalization = ("loudnorm=I=-14:TP=-2:LRA=7:"
                 f"measured_I={first['input_i']}:measured_TP={first['input_tp']}:"
                 f"measured_LRA={first['input_lra']}:measured_thresh={first['input_thresh']}:"
                 f"offset={first['target_offset']}:linear=true:print_format=json")
master = OUT / "pocket-groove-final.wav"
final = measurement(ffmpeg(["-i", source_mix, "-af", normalization, "-t", "15",
                           "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", str(master)]).stderr)
ffmpeg(["-i", str(master), "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart",
        str(OUT / "roster-pocket-groove.m4a")])
# Stable generic names follow the current edit; explicitly named older cues stay intact.
(OUT / "premiere-score.wav").write_bytes(master.read_bytes())
(OUT / "five-in-motion.m4a").write_bytes((OUT / "roster-pocket-groove.m4a").read_bytes())
(ROOT / "audio_meta.json").write_text(json.dumps({
    "bgm": {"path": "assets/audio/pocket-groove-final.wav", "volume": 1},
    "voices": [], "sfx": [], "duration": 15,
    "note": "Pocket Groove: selected jazzy lo-fi catalog bed, adjusted from approximately 125 to 128 BPM, with original picture-timed sound effects baked into a 48 kHz stereo master."
}, indent=2) + "\n")
# Keep approval attached to the accepted bytes, even after an identical rebuild.
# A changed mix cannot inherit approval from an earlier soundtrack.
approval_path = ROOT / "verification/pocket-groove-approval.json"
approval = json.loads(approval_path.read_text()) if approval_path.exists() else {}
master_hash = hashlib.sha256(master.read_bytes()).hexdigest()
listening_hash = hashlib.sha256((OUT / "roster-pocket-groove.m4a").read_bytes()).hexdigest()
is_approved = (approval.get("masterSha256") == master_hash
               and approval.get("listeningCopySha256") == listening_hash)
report = {
    "title": "Roster — Pocket Groove", "duration": DURATION, "sampleRate": SR,
    "music": {"provider": "HeyGen audio catalog", "id": "42cc02db157645af90a944d8bd53e77a",
              "catalogDescription": "upbeat light jazzy track, bright upright bass, brushed drums, Rhodes keys, muted horns, medium-fast tempo 110-125 BPM, instrumental",
              "sourceExcerptSeconds": [7.704, 23.704], "estimatedSourceBpm": 125,
              "tempoMultiplier": 1.024, "targetBpm": 128, "pitchPreserved": True,
              "sourceFile": str(SOURCE.relative_to(ROOT)),
              "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
    "soundDesign": {"authorship": "Original synthesized picture-timed effects", "seed": 202609081,
                    "events": sorted(events, key=lambda item: item["seconds"])},
    "dependencies": {"numpy": np.__version__, "scipy": scipy.__version__},
    "normalization": {"targetLufs": -14, "targetTruePeakDbtp": -2, "before": first, "after": final},
    "masterSha256": master_hash,
    "listeningCopySha256": listening_hash,
    "listeningApproval": (f"The owner accepted the Pocket Groove revision on {approval['approvedOn']}."
                          if is_approved else "Pending user audition in Studio; this mix does not match the approved audio bytes.")
}
(ROOT / "verification/pocket-groove-mix.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"master": str(master), "events": len(events), "loudness": final}, indent=2))
