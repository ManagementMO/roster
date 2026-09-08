"""Five in Motion — Ignition: an original 15-second electronic launch score.

The 128 BPM grid follows the existing picture edit exactly. Punchy drums,
rhythmic bass, wide synth chords and a rising final build replace the first
version's sparse bell-led arrangement. Every sound is synthesized locally.
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
STEMS = OUT / "stems"
STEMS.mkdir(parents=True, exist_ok=True)
SR = 48000
BPM = 128
BEAT = 60 / BPM
DURATION = 15.0
N = round(DURATION * SR)
RNG = np.random.default_rng(20260908)
stems = {name: np.zeros((N, 2)) for name in ["drums", "bass", "chords", "lead", "design"]}
events = []


def clock(duration):
    return np.arange(round(duration * SR)) / SR


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def filtered(signal, cutoff, kind="lowpass", order=2):
    return sosfilt(butter(order, cutoff, btype=kind, fs=SR, output="sos"), signal)


def env(t, attack=.002, decay=.2, release=.04):
    return (1 - np.exp(-t / attack)) * np.exp(-t / decay) * np.clip((t[-1] - t) / release, 0, 1)


def add(stem, at, sound, gain=1, pan=0, label=None):
    start = round(at * SR)
    if start < 0 or start >= N:
        return
    sound = sound[:N - start]
    if sound.ndim == 1:
        angle = (pan + 1) * math.pi / 4
        sound = np.column_stack((sound * math.cos(angle), sound * math.sin(angle)))
    stems[stem][start:start + len(sound)] += sound * gain
    if label:
        events.append({"stem": stem, "at": round(at, 6), "label": label, "gain": gain})


def kick():
    t = clock(.39)
    # A short pitched attack, solid low fundamental and a separate beater transient.
    phase = 2 * np.pi * (49 * t + 142 * .013 * (1 - np.exp(-t / .013)) + 28 * .045 * (1 - np.exp(-t / .045)))
    body = np.sin(phase) * env(t, .0008, .095, .045)
    click = filtered(RNG.standard_normal(len(t)), [2100, 6900], "bandpass")
    sound = body + .12 * click * env(t, .0003, .006, .015)
    return np.tanh(sound * 1.65) * .78


def snare():
    t = clock(.23)
    noise = filtered(RNG.standard_normal(len(t)), [1350, 10500], "bandpass")
    body = np.sin(2 * np.pi * (174 * t + 43 * .012 * (1 - np.exp(-t / .012))))
    snap = .7 * noise * env(t, .0005, .032, .025) + .31 * body * env(t, .001, .039, .03)
    # Closely spaced noise bursts make the clap wider without an external sample.
    for offset, gain in [(0.009, .22), (.019, .30)]:
        local = np.maximum(t - offset, 0)
        snap += gain * noise * (t >= offset) * (1 - np.exp(-local / .0006)) * np.exp(-local / .028)
    return np.tanh(snap * 1.25)


def hat(opened=False):
    t = clock(.12 if opened else .038)
    noise = filtered(RNG.standard_normal(len(t)), [7000, 16000], "bandpass")
    metallic = sum(np.sin(2 * np.pi * f * t) for f in [7140, 8730, 10870]) / 3
    return (.84 * noise + .16 * metallic) * env(t, .00035, .036 if opened else .01, .012)


def bass(note, duration, bright=.9):
    t = clock(duration)
    f = hz(note)
    sub = .62 * np.sin(2 * np.pi * f * t)
    harmonics = np.zeros(len(t))
    for k in range(2, 13):
        harmonics += np.sin(2 * np.pi * f * k * t) / k * np.exp(-k * (.11 + 3.3 * t))
    growl = filtered(np.tanh((sub + harmonics * bright) * 2.4), 2300)
    return growl * env(t, .0025, .23, .026)


def synth(notes, duration=.44, bright=.9, decay=.2):
    t = clock(duration)
    result = np.zeros((len(t), 2))
    # Band-limited additive saw voices avoid aliasing and the earlier bell timbre.
    for channel, detunes in enumerate([[-.085, .018, .053], [-.052, -.017, .086]]):
        for note in notes:
            for detune in detunes:
                f = hz(note + detune)
                phase = RNG.uniform(-.22, .22)
                for k in range(1, min(17, int(15500 / f))):
                    brightness = np.exp(-k * (.085 / bright + t * 1.9))
                    result[:, channel] += np.sin(2 * np.pi * f * k * t + phase * k) * brightness / k
    result /= max(1, len(notes)) * 3
    result = np.tanh(result * 1.15)
    return result * env(t, .006, decay, .075)[:, None]


def tick(note=84):
    t = clock(.09)
    noise = filtered(RNG.standard_normal(len(t)), [2400, 8400], "bandpass")
    tone = np.sin(2 * np.pi * hz(note) * t + .2 * np.sin(2 * np.pi * hz(note) * 2 * t))
    return (.6 * tone + .28 * noise) * env(t, .0006, .011, .02)


def whoosh(duration=.22, rising=False):
    t = clock(duration)
    fraction = t / duration
    noise = filtered(RNG.standard_normal(len(t)), [1200, 11000], "bandpass")
    shape = fraction ** 1.6 if rising else np.sin(np.pi * fraction) ** 1.3
    phase = 2 * np.pi * (310 * t + 2600 * t ** 2 / (2 * duration))
    tone = np.sin(phase) * .095
    return (noise * .36 + tone) * shape * np.clip((duration - t) / .014, 0, 1)


def impact(duration=.8):
    t = clock(duration)
    phase = 2 * np.pi * (41.2 * t + 100 * .022 * (1 - np.exp(-t / .022)))
    air = filtered(RNG.standard_normal(len(t)), [1600, 12000], "bandpass")
    return np.sin(phase) * env(t, .001, .15, .10) + .20 * air * env(t, .0007, .055, .04)


def crash(duration=.65):
    t = clock(duration)
    noise = filtered(RNG.standard_normal(len(t)), [4900, 15000], "bandpass")
    return noise * env(t, .0005, .18, .11)


# Picture anchors: five at beat 4, task at beat 8, call at beat 16,
# learning/build at beat 22, identity/drop at beat 26, final resolve at beat 30.
kick_times = []
for beat in range(31):
    at = beat * BEAT
    build = 22 <= beat < 26
    if not (build and beat >= 24):
        gain = .87 if beat >= 4 else .79
        add("drums", at, kick(), gain, label="kick")
        kick_times.append(at)
    if beat % 2 and beat < 30 and not build:
        add("drums", at, snare(), .53, .025, "snare and clap")
    if beat < 30:
        add("drums", at + .5 * BEAT, hat(True), .18, .15, "offbeat hat")
        for subdivision, velocity, pan in [(.0, .085, -.13), (.25, .078, -.3), (.75, .105, .3)]:
            add("drums", at + subdivision * BEAT, hat(), velocity, pan, "sixteenth hat")

roots = [28, 28, 24, 24, 31, 26, 28, 28]
voicings = [
    [52, 55, 59, 66], [52, 55, 59, 66], [48, 52, 55, 62], [48, 52, 55, 62],
    [55, 59, 62, 69], [50, 54, 57, 64], [52, 55, 59, 66], [52, 55, 59, 64],
]
bass_pattern = [(0, 0), (.5, 0), (.75, 12), (1.25, 0), (1.5, 7), (2, 0), (2.75, 0), (3.25, 12), (3.5, 7)]
motif = [0, 7, 10, 14, 12, 7, 3, 10]
for bar, (root, notes) in enumerate(zip(roots, voicings)):
    origin = bar * 4 * BEAT
    for step, interval in bass_pattern:
        at = origin + step * BEAT
        if 10.9 <= at < 12.1875 or at >= 14.06:
            continue
        add("bass", at, bass(root + interval, .19 if step % 1 else .28), .42 if bar else .36, label=f"rhythmic bass {root + interval}")
    for step, velocity in [(0, .43), (1.5, .29), (2.75, .35)]:
        at = origin + step * BEAT
        if at >= 14.06 or 10.9 <= at < 12.1875:
            continue
        add("chords", at, synth(notes, .64, decay=.23), velocity, label="wide synth chord")
    for index, interval in enumerate(motif):
        at = origin + index * .5 * BEAT
        if at >= 13.8 or 10.9 <= at < 12.1875:
            continue
        # A warm saw phrase has more body and motion than the previous sparse bells.
        velocity = .24 if index in [0, 3, 4] else .17
        add("lead", at, synth([root + 36 + interval], .27, bright=.85, decay=.095), velocity,
            label=f"driving synth phrase {root + 36 + interval}")

# The local-learning beat doubles as a short, accelerating build into the brand.
build_start = 10.3125
drop = 12.1875
add("design", build_start, whoosh(drop - build_start, True), .28, label="identity riser")
for index, at in enumerate(np.arange(11.015625, drop - .08, BEAT / 4)):
    add("drums", float(at), snare(), .16 + index * .026, -.04 if index % 2 else .04, "accelerating snare build")
for index, note in enumerate([64, 67, 71, 74, 76, 78, 79, 83]):
    at = build_start + index * (drop - build_start) / 8
    add("lead", at, synth([note], .23, bright=1.1, decay=.085), .18 + index * .012, label="ascending build")

# A deliberate drop and two harmonically related closing hits give the logo a payoff.
for at, velocity in [(0, .19), (1.875, .13), (3.75, .15), (7.5, .22), (drop, .30)]:
    add("drums", at, crash(), velocity, .15, "section crash")
add("design", drop, impact(1.25), .47, label="logo low impact")
add("chords", drop, synth([52, 55, 59, 64, 66], 2.25, bright=1.2, decay=.78), .76, label="logo Em9 synth hit")
add("bass", drop, bass(28, .7, bright=1), .48, label="logo E1 sub")
add("lead", drop, synth([76, 83], .7, bright=1, decay=.28), .29, label="logo octave accent")
add("chords", 14.0625, synth([52, 59, 64, 66], .9375, bright=.85, decay=.42), .58, label="final Em add9 resolve")
add("bass", 14.0625, bass(28, .68), .36, label="final sub resolve")

# Small interface accents follow actual animation events at their original times.
click_times = [.08, .17, .25, .34, .43, .51, .60, .68]
click_times += [1.875 + t for t in [.18, .26, .33, .39, .44]]
click_times += [4.57, 5.20, 5.31, 5.41, 5.50, 5.58, 6.35, 8.35, 9.05]
click_times += [10.3125 + t for t in [.20, .32, .43, .82]]
for index, at in enumerate(click_times):
    add("design", at, tick([76, 83, 86, 88, 90][index % 5]), .105 if at not in [4.57, 6.35, 9.05] else .18, label="product tick")
for cut in [1.875, 3.75, 7.5, 10.3125, drop]:
    add("design", cut - .22, whoosh(), .30 if cut == drop else .21, label="transition air")

# Filtered short reflections keep the mix wide while the rhythmic center stays dry.
for name in ["lead", "chords"]:
    dry = stems[name].copy()
    wet = np.column_stack([filtered(dry[:, c], 5700) for c in range(2)])
    for seconds, gain, swap in [(BEAT * .75, .19, True), (BEAT * 1.5, .085, False), (.037, .10, True), (.067, .075, False), (.113, .04, True)]:
        delay = round(seconds * SR)
        reflected = wet[:, ::-1] if swap else wet
        stems[name][delay:] += reflected[:-delay] * gain

duck = np.ones(N)
for at in kick_times:
    start = round(at * SR)
    t = clock(.22)
    curve = 1 - .67 * np.exp(-t / .065)
    end = min(N, start + len(curve))
    duck[start:end] = np.minimum(duck[start:end], curve[:end - start])
for name in ["bass", "chords", "lead"]:
    stems[name] *= duck[:, None]

# One tiny breath before the logo creates impact without interrupting the narrative.
breath_start = round((drop - .060) * SR)
breath_end = round(drop * SR)
for name in ["drums", "bass", "chords", "lead"]:
    stems[name][breath_start:breath_end] *= np.linspace(1, .03, breath_end - breath_start)[:, None] ** 2

tail = np.ones(N)
tail_start = round(14.57 * SR)
tail[tail_start:] = np.cos(np.linspace(0, np.pi / 2, N - tail_start)) ** 1.5
mix = np.zeros((N, 2))
for name, sound in stems.items():
    sound *= tail[:, None]
    sound = np.column_stack([filtered(sound[:, c], 27, "highpass") for c in range(2)])
    wavfile.write(STEMS / f"{name}.wav", SR, sound.astype(np.float32))
    mix += sound

assert np.isfinite(mix).all() and len(mix) == 720000
wavfile.write(OUT / "original-score-float.wav", SR, mix.astype(np.float32))
report = {
    "title": "Five in Motion — Ignition",
    "composition": "Original electronic launch score composed and synthesized for the fixed picture edit",
    "revision": "Driving bass, crisp snare/clap and sixteenth hats, wide saw chords, ascending build and logo drop",
    "bpm": BPM, "bars": 8, "meter": "4/4", "tonality": "E minor", "duration": DURATION,
    "sampleRate": SR, "seed": 20260908, "externalSamples": [],
    "dependencies": {"numpy": np.__version__, "scipy": scipy.__version__},
    "stems": list(stems), "rawPeak": float(np.max(np.abs(mix))),
    "pictureAnchors": {"five": 1.875, "task": 3.75, "call": 7.5, "build": 10.3125, "logoDrop": drop, "resolve": 14.0625},
    "events": sorted(events, key=lambda event: event["at"]),
}
(ROOT / "verification").mkdir(exist_ok=True)
(ROOT / "verification/music-composition.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Composed Ignition: {DURATION}s at {BPM} BPM, {len(events)} events, five stems, raw peak {report['rawPeak']:.3f}.")
