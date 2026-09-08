"""Five in Motion: an original 15-second, eight-bar score for Roster.

Every oscillator, drum transient, noise sweep and note is synthesized here.
There are no stock music excerpts, generated-service tracks or external samples.
The five stems let the rhythm and product accents be revised independently.
"""

from pathlib import Path
import json
import math

import numpy as np
import scipy
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/audio"
OUT.mkdir(parents=True, exist_ok=True)
STEMS = OUT / "stems"
STEMS.mkdir(exist_ok=True)
SR = 48000
DURATION = 15.0
BPM = 128
BEAT = 60 / BPM
N = round(DURATION * SR)
RNG = np.random.default_rng(20260907)
stems = {name: np.zeros((N, 2)) for name in ["drums", "bass", "chords", "lead", "design"]}
events = []


def clock(duration):
    return np.arange(round(duration * SR)) / SR


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def filtered(x, cutoff, kind="lowpass", order=2):
    return sosfilt(butter(order, cutoff, btype=kind, fs=SR, output="sos"), x)


def envelope(t, attack=.002, decay=.18, release=.025):
    # Short attacks avoid clicks; an independent terminal release avoids cut tails.
    return (1 - np.exp(-t / attack)) * np.exp(-t / decay) * np.clip((t[-1] - t) / release, 0, 1)


def add(stem, at, sound, gain=1, pan=0, label=None):
    start = round(at * SR)
    if start >= N:
        return
    sound = sound[:N - start]
    if sound.ndim == 1:
        p = (pan + 1) * math.pi / 4
        sound = np.column_stack((sound * math.cos(p), sound * math.sin(p)))
    stems[stem][start:start + len(sound)] += sound * gain
    if label:
        events.append({"stem": stem, "at": round(at, 6), "label": label, "gain": gain})


def kick():
    t = clock(.42)
    phase = 2 * np.pi * (48 * t + 95 * .012 * (1 - np.exp(-t / .012)) + 40 * .04 * (1 - np.exp(-t / .04)))
    body = np.sin(phase) * envelope(t, .0015, .105, .04)
    transient = filtered(RNG.standard_normal(len(t)), [1000, 4800], "bandpass")
    return np.tanh(1.5 * (body + .08 * transient * np.exp(-t / .005))) * .67


def clap():
    t = clock(.18)
    noise = filtered(RNG.standard_normal(len(t)), [850, 6200], "bandpass")
    burst = np.zeros(len(t))
    for at, level in [(0, .5), (.011, .75), (.024, 1)]:
        local = np.maximum(t - at, 0)
        burst += (t >= at) * level * (1 - np.exp(-local / .0008)) * np.exp(-local / .026)
    body = .1 * np.sin(2 * np.pi * 185 * t) * np.exp(-t / .035)
    return (noise * burst + body) * np.clip((t[-1] - t) / .025, 0, 1)


def hat(open_hat=False):
    duration = .15 if open_hat else .047
    t = clock(duration)
    noise = filtered(RNG.standard_normal(len(t)), [6600, 14500], "bandpass")
    # A little metallic harmonic energy gives definition without a harsh noise shelf.
    metal = sum(np.sin(2 * np.pi * f * t) for f in [7140, 9060, 11730]) / 3
    return (noise * .7 + metal * .3) * envelope(t, .0007, .044 if open_hat else .013, .015)


def bass(note, length):
    t = clock(length)
    f = hz(note)
    wave = np.sin(2 * np.pi * f * t) + .26 * np.sin(2 * np.pi * 2 * f * t)
    wave += .1 * np.sin(2 * np.pi * 3 * f * t)
    return np.tanh(wave * 1.45) * envelope(t, .003, .22, .028)


def chord(notes, length=.68):
    t = clock(length)
    stereo = np.zeros((len(t), 2))
    for channel, detune in enumerate([-.035, .035]):
        for note in notes:
            f = hz(note + detune)
            wave = sum(np.sin(2 * np.pi * f * harmonic * t) / harmonic ** 1.65 for harmonic in range(1, 7))
            stereo[:, channel] += wave / len(notes)
    amp = (1 - np.exp(-t / .007)) * (.83 * np.exp(-t / .19) + .17 * np.exp(-t / .65))
    amp *= np.clip((t[-1] - t) / .1, 0, 1)
    return stereo * amp[:, None]


def pluck(note, length=.3):
    t = clock(length)
    f = hz(note)
    phase = 2 * np.pi * f * t
    wave = np.sin(phase + .65 * np.sin(2 * phase) * np.exp(-t / .035))
    wave += .17 * np.sin(3 * phase) * np.exp(-t / .025)
    return wave * envelope(t, .0017, .067, .035)


def click(length=.075):
    t = clock(length)
    transient = filtered(RNG.standard_normal(len(t)), [1700, 5100], "bandpass")
    tonal = np.sin(2 * np.pi * (1050 * t + 300 * .007 * (1 - np.exp(-t / .007))))
    return (.62 * tonal + .38 * transient) * envelope(t, .001, .012, .02)


def sweep(length=.24):
    t = clock(length)
    noise = filtered(RNG.standard_normal(len(t)), [900, 8200], "bandpass")
    amp = np.sin(np.pi * (t / length)) ** 1.6
    return noise * amp * .35


def impact(length=.48):
    t = clock(length)
    phase = 2 * np.pi * (58 * t + 65 * .024 * (1 - np.exp(-t / .024)))
    air = filtered(RNG.standard_normal(len(t)), [2000, 8500], "bandpass")
    return (np.sin(phase) * np.exp(-t / .11) + .13 * air * np.exp(-t / .035)) * (1 - np.exp(-t / .001)) * np.clip((length - t) / .09, 0, 1)


# Eight bars: a concise E-minor / C-major / G-major / D-major arc resolves back to E.
roots = [40, 40, 36, 36, 43, 38, 40, 40]
voicings = [
    [52, 55, 59, 66], [52, 55, 59, 66], [48, 52, 55, 62], [48, 52, 55, 62],
    [55, 59, 62, 69], [50, 54, 57, 64], [52, 55, 59, 66], [52, 55, 59, 64],
]

# Immediate pulse, quieter ghost hats and a slight late offbeat make a groove, not a click track.
kick_times = []
for beat in range(30):
    at = beat * BEAT
    add("drums", at, kick(), .83, label="kick")
    kick_times.append(at)
    if beat % 2:
        add("drums", at, clap(), .23, .05, "clap")
    add("drums", at + .5 * BEAT, hat(True), .14, .22, "open hat")
    if beat < 28:
        add("drums", at + .255 * BEAT, hat(), .075, -.3)
        add("drums", at + .765 * BEAT, hat(), .10 if beat % 2 else .07, .3)

for bar, (root, notes) in enumerate(zip(roots, voicings)):
    origin = bar * 4 * BEAT
    # Syncopated bass keeps the quarter-note kick uncluttered and carries phone-speaker harmonics.
    for step, interval, length, velocity in [(.0, 0, .33, .78), (.75, 0, .22, .64), (1.5, 7, .22, .6), (2.25, 0, .29, .74), (3.25, 12, .17, .52)]:
        if origin + step * BEAT < 13.85:
            add("bass", origin + step * BEAT, bass(root + interval, length), .43 * velocity, label=f"bass {root + interval}")
    for step in [.5, 2.5]:
        add("chords", origin + step * BEAT, chord(notes), .36, label="chord stab")
    motif = [(0, 0), (.75, 7), (1.5, 12), (2.5, 14), (3.25, 7)]
    for index, (step, interval) in enumerate(motif):
        at = origin + step * BEAT
        if at < 13.7:
            add("lead", at, pluck(root + 24 + interval), .15 if index in [0, 2] else .105, [-.20, .15, 0, .2, -.1][index], f"five-note motif {root + 24 + interval}")

# The brand arrives on beat26. A broad Em9 and octave E give it a specific musical destination.
add("chords", 12.1875, chord([52, 55, 59, 64, 66], 2.6), .58, label="identity resolve Em9")
add("lead", 12.1875, pluck(76, .7), .21, 0, "identity E5")
add("chords", 13.125, chord([52, 59, 64, 66], 1.85), .38, label="final tonic tail")

# Product sound design uses the actual local-to-master animation cues, not arbitrary beat stickers.
design_cues = [
    ("impact", 0.015, .20),
    *[("click", at, .11) for at in [.08, .17, .25, .34, .43, .51, .60, .68]],
    *[("click", 1.875 + at, .13) for at in [.18, .26, .33, .39, .44]],
    ("click", 4.57, .18),
    *[("click", 3.75 + at, .10) for at in [1.45, 1.56, 1.66, 1.75, 1.83]],
    ("click", 6.35, .22),
    ("sweep", 7.70, .15), ("impact", 8.35, .13),
    ("sweep", 8.65, .12), ("click", 9.05, .18),
    *[("click", 10.3125 + at, .14) for at in [.20, .32, .43, .82]],
    ("impact", 12.1875, .30),
]
for cut in [1.875, 3.75, 7.5, 10.3125, 12.1875]:
    design_cues.append(("sweep", cut - .19, .18))
for kind, at, gain in sorted(design_cues, key=lambda cue: cue[1]):
    sound = {"click": click, "sweep": sweep, "impact": impact}[kind]()
    add("design", at, sound, gain, 0, kind)

# Rhythmic stereo echoes and a small filtered room give space; bass and kick remain centered.
for stem in ["lead", "chords"]:
    dry = stems[stem].copy()
    for seconds, gain, swap in [(BEAT * .75, .22, True), (BEAT * 1.5, .10, False), (.053, .09, True), (.097, .06, False)]:
        delay = round(seconds * SR)
        wet = np.column_stack([filtered(dry[:, c], 5200) for c in range(2)])
        if swap:
            wet = wet[:, ::-1]
        stems[stem][delay:] += wet[:-delay] * gain

# Gentle sidechain spacing: the kick stays articulate without flattening the whole master.
duck = np.ones(N)
for at in kick_times:
    i = round(at * SR)
    t = clock(.24)
    curve = 1 - .54 * np.exp(-t / .075)
    end = min(N, i + len(curve))
    duck[i:end] = np.minimum(duck[i:end], curve[:end - i])
for stem in ["bass", "chords", "lead"]:
    stems[stem] *= duck[:, None]

tail = np.ones(N)
fade_start = round(14.28 * SR)
tail[fade_start:] = np.cos(np.linspace(0, np.pi / 2, N - fade_start)) ** 1.7
mix = np.zeros((N, 2))
for name, sound in stems.items():
    sound *= tail[:, None]
    sound = np.column_stack([filtered(sound[:, c], 28, "highpass") for c in range(2)])
    wavfile.write(STEMS / f"{name}.wav", SR, sound.astype(np.float32))
    mix += sound

assert np.isfinite(mix).all() and len(mix) == 720000
wavfile.write(OUT / "original-score-float.wav", SR, mix.astype(np.float32))
report = {
    "title": "Five in Motion", "composition": "Original, procedurally composed and synthesized for this Roster film",
    "bpm": BPM, "bars": 8, "meter": "4/4", "tonality": "E minor", "duration": DURATION,
    "sampleRate": SR, "seed": 20260907, "externalSamples": [],
    "dependencies": {"numpy": np.__version__, "scipy": scipy.__version__},
    "stems": list(stems), "rawPeak": float(np.max(np.abs(mix))), "events": sorted(events, key=lambda event: event["at"]),
}
(ROOT / "verification").mkdir(exist_ok=True)
(ROOT / "verification/music-composition.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Composed {DURATION}s at {BPM} BPM: {len(events)} note/percussion/design events, five stems, raw peak {report['rawPeak']:.3f}.")
