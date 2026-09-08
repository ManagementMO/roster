"""Original picture-scored pop-rock cue, played with CC0 recorded instruments.

The notes and arrangement are ours. Individual guitar, bass and drum recordings
come from Karoryfer's CC0 libraries; no existing song or music loop is used.
"""
from functools import lru_cache
from pathlib import Path
import json
import subprocess
import numpy as np
import scipy
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, resample_poly

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/audio"
SAMPLES = OUT / "samples"
STEMS = OUT / "stems"
STEMS.mkdir(exist_ok=True)
SR = 48000
BPM = 128
BEAT = 60 / BPM
DURATION = 15.0
N = round(SR * DURATION)
RNG = np.random.default_rng(20260909)
stems = {name: np.zeros((N, 2)) for name in ["drums", "bass", "chords", "lead", "design"]}
events = []


def clock(seconds):
    return np.arange(round(seconds * SR)) / SR


def filt(signal, cutoff, kind="lowpass", order=2):
    return sosfilt(butter(order, cutoff, btype=kind, fs=SR, output="sos"), signal, axis=0)


def add(stem, at, sound, gain=1, pan=0, label=""):
    offset = round(at * SR)
    if offset >= N:
        return
    if offset < 0:
        sound = sound[-offset:]
        offset = 0
    count = min(len(sound), N - offset)
    if sound.ndim == 1:
        angle = (pan + 1) * np.pi / 4
        sound = sound[:, None] * np.array([np.cos(angle), np.sin(angle)])[None, :]
    stems[stem][offset:offset + count] += sound[:count] * gain
    events.append({"at": round(at, 6), "stem": stem, "event": label, "gain": round(gain, 4)})


@lru_cache(maxsize=None)
def sample(name):
    # FFmpeg handles both original 24-bit WAV and FLAC without a new audio SDK.
    result = subprocess.run(["ffmpeg", "-v", "error", "-i", str(SAMPLES / name),
                             "-ar", str(SR), "-ac", "1", "-f", "f32le", "-"],
                            capture_output=True, check=True)
    data = np.frombuffer(result.stdout, dtype="<f4").astype(np.float64)
    assert len(data) and np.isfinite(data).all(), name
    peak = np.max(np.abs(data))
    onset = np.flatnonzero(np.abs(data) > peak * .025)[0]
    data = data[max(0, onset - 48):]
    # Strip leading recording space so the actual pick/drum transient meets picture.
    return data / max(peak, 1e-8)


def gate(data, seconds, muted=False):
    count = round(seconds * SR)
    sound = np.zeros(count)
    sound[:min(count, len(data))] = data[:count]
    t = np.arange(count) / SR
    attack = np.clip(t / .001, 0, 1)
    release = np.clip((seconds - t) / min(.035, seconds / 3), 0, 1) ** 1.3
    if muted:
        release *= np.exp(-t / .075)
    return sound * attack * release


def guitar(midi, seconds, instrument="green", rr=1, muted=False):
    sound = sample(f"{instrument}-{midi}-{rr}.wav")
    return gate(sound, seconds, muted)


def strum(root, seconds, instrument, rr, muted, upward=False):
    notes = [root, root + 7, root + 12]
    if upward:
        notes.reverse()
    out = np.zeros(round((seconds + .016) * SR))
    for index, midi in enumerate(notes):
        take = guitar(midi, seconds, instrument, 1 + ((rr + index) % 2), muted)
        start = round(index * .004 * SR)
        out[start:start + len(take)] += take * [1, .73, .57][index]
    # The two guitars are different recorded instruments and takes. Amp shaping
    # happens after the strings sum, retaining real pick attacks and beating.
    out = filt(out, 115, "highpass")
    out = np.tanh(out * (3.2 if instrument == "green" else 3.8))
    out = filt(out, 6000 if instrument == "green" else 5400, order=3)
    out += .24 * filt(out, [900, 2400], "bandpass")
    return out * .46


def rhythm(at, root, seconds, gain, muted=False, upward=False, rr=1):
    add("chords", at, strum(root, seconds, "green", rr, muted, upward), gain, -.87, "left electric guitar")
    add("chords", at + .008, strum(root, seconds, "black", 3 - rr, muted, upward), gain * .94, .87, "right electric guitar")


def bass_note(midi, seconds, rr=1):
    sound = gate(sample(f"bass-{midi}-{rr}.wav"), seconds)
    sound = filt(sound, 38, "highpass")
    sound = filt(np.tanh(sound * 1.75), 2900)
    return sound * .63


def drum(name, seconds, rr=1):
    sound = gate(sample(f"{name}-{rr}.flac"), seconds)
    if name == "kick":
        sound = filt(sound, 32, "highpass")
    elif name.startswith("snare"):
        sound = filt(sound, 135, "highpass")
    elif "hat" in name or name == "crash":
        sound = filt(sound, 1500, "highpass")
    return sound


def snare(at, gain=.66, rr=1, label="rock backbeat"):
    add("drums", at, drum("snare", .36, rr), gain, -.035, label)
    add("drums", at + .005, drum("snare-room", .46, rr), gain * .24, .18, "snare overhead")


def kick(at, gain=.84, rr=1):
    add("drums", at, drum("kick", .30, rr), gain, label="acoustic kick")


def sweep(seconds, up=True):
    t = clock(seconds)
    sound = filt(RNG.standard_normal(len(t)), [2400, 12500], "bandpass")
    shape = (t / seconds) ** 1.8 if up else np.sin(np.pi * t / seconds) ** 1.4
    return sound * shape * np.clip((seconds - t) / .012, 0, 1)


def tick(midi, seconds=.05):
    t = clock(seconds)
    frequency = 440 * 2 ** ((midi - 69) / 12)
    return np.sin(2 * np.pi * frequency * t) * np.exp(-t / .009) * np.clip(t / .001, 0, 1)


def landing_tap():
    """A dry, short contact sound; its own seed leaves the band takes intact."""
    t = clock(.048)
    noise = np.random.default_rng(8200).standard_normal(len(t))
    texture = filt(noise, [1100, 3800], "bandpass") * np.exp(-t / .0025)
    body = np.sin(2 * np.pi * 660 * t) * np.exp(-t / .011)
    return (.62 * body + .24 * texture) * np.clip(t / .0008, 0, 1)


# Bright C-major pop harmony. Eight bars still fit the existing fifteen seconds.
# The rhythm is a syncopated rock kit, with up/down eighth-note guitar movement.
roots = [48, 43, 45, 41, 48, 43, 41, 48]
kick_pattern = [0, .75, 1.5, 2, 2.75, 3.5]
strums = [(0, .36, 1.0), (.5, .15, .68), (.75, .16, .65),
          (1.5, .29, .94), (2, .29, 1.0), (2.5, .15, .65),
          (3, .26, .88), (3.5, .28, .91)]
for bar, root in enumerate(roots):
    origin = bar * 4 * BEAT
    for index, step in enumerate(kick_pattern):
        at = origin + step * BEAT
        if 11.25 <= at < 12.1875 or at >= 14.0625:
            continue
        kick(at, .88 if step in [0, 2] else .72, 1 + index % 2)
    for step in [1, 3]:
        at = origin + step * BEAT
        if at < 11.25 or 12.1875 <= at < 14.0625:
            snare(at, .72, 1 + bar % 2)
    for index in range(8):
        at = origin + index * .5 * BEAT
        if 11.48 <= at < 12.1875 or at >= 14.0625:
            continue
        open_hat = index in [3, 7]
        name = "open-hat" if open_hat else "hat"
        add("drums", at, drum(name, .22 if open_hat else .13, 1 + index % 2),
            .26 if open_hat else (.21 if index % 2 == 0 else .15), .26, name)
    for index, (step, seconds, gain) in enumerate(strums):
        at = origin + step * BEAT
        if 10.9 <= at < 12.1875 or at >= 14.0625:
            continue
        actual_root = 48 if at >= 12.1875 else root
        rhythm(at, actual_root, seconds, gain * .62, muted=seconds < .2,
               upward=index % 2 == 1, rr=1 + (index + bar) % 2)
    for index in range(8):
        at = origin + index * .5 * BEAT
        if 11.0 <= at < 12.1875 or at >= 14.0625:
            continue
        actual_root = 36 if at >= 12.1875 else root - 12
        add("bass", at, bass_note(actual_root, .215, 1 + index % 2), .58 if index % 2 == 0 else .49,
            label=f"picked bass {actual_root}")

# A singable guitar hook, rather than a continuous high-pitched synth arpeggio.
phrases = [
    [(0, 76, .28), (.75, 74, .18), (1.5, 72, .30), (2.5, 67, .18), (3, 69, .22), (3.5, 67, .24)],
    [(0, 67, .27), (1, 69, .21), (1.5, 67, .25), (2.5, 62, .20), (3, 64, .32)],
    [(0, 72, .31), (1, 76, .25), (1.75, 74, .22), (2.5, 72, .26), (3.5, 69, .20)],
    [(0, 65, .26), (1, 69, .30), (2, 72, .28), (3, 74, .31)],
]
for bar in range(6):
    for index, (step, midi, seconds) in enumerate(phrases[bar % 4]):
        at = (bar * 4 + step) * BEAT
        if at >= 10.55:
            continue
        sound = guitar(midi, seconds, "green", 1 + index % 2)
        sound = filt(np.tanh(filt(sound, 250, "highpass") * 2.1), 6700)
        add("lead", at, sound, .16 if bar < 2 else .19, -.10, f"pop guitar hook {midi}")

# Transition fills are written to exact picture anchors, independent of kit groove.
for cut in [1.875, 3.75, 7.5]:
    add("drums", cut - BEAT / 2, drum("tom-high", .23), .28, -.25, "transition tom")
    add("drums", cut - BEAT / 4, drum("tom-low", .30, 2), .36, .20, "transition floor tom")
    add("drums", cut, drum("crash", .95, 1), .22, -.26, "section crash")
add("drums", 0, drum("crash", .85, 2), .21, -.28, "opening crash")

# Local coaching lifts into a brief band stop, then a wide C-major logo hit.
drop = 12.1875
add("design", 10.65, sweep(drop - 10.65), .075, label="logo lift")
for index, midi in enumerate([65, 67, 69, 72, 74, 76]):
    at = 10.78125 + index * BEAT / 2
    sound = filt(np.tanh(guitar(midi, .24, "black", 1 + index % 2) * 2.2), 6500)
    add("lead", at, sound, .15 + index * .012, -.08, "ascending guitar pickup")
for index in range(7):
    at = 11.25 + index * BEAT / 4
    snare(at, .25 + index * .035, 1 + index % 2, "snare build")
add("drums", drop - BEAT / 4, drum("tom-low", .28), .48, .26, "fill landing")

for at, length, gain in [(drop, 1.35, .92), (14.0625, .9375, .74)]:
    kick(at, .98)
    snare(at, .72)
    rhythm(at, 48, length, gain)
    add("bass", at, bass_note(36, min(length, .8)), .68, label="C bass resolve")
    add("drums", at, drum("crash", length, 2), .32, -.25, "logo crash")
    # The major third and ninth give the final power chord its upbeat pop color.
    for midi, pan in [(64, -.25), (74, .25), (76, .02)]:
        sound = filt(np.tanh(guitar(midi, length, "green", 2) * 1.7), 6500)
        add("lead", at + .012, sound, .12, pan, "C add9 final guitar")

click_times = [.08, .17, .25, .34, .43, .51, .60, .68]
click_times += [1.875 + t for t in [.18, .26, .33, .39, .44]]
click_times += [4.57, 5.20, 5.31, 5.41, 5.50, 5.58, 6.35, 8.35, 9.05]
click_times += [10.3125 + t for t in [.20, .32, .43, .82]]
for index, at in enumerate(click_times):
    add("design", at, tick([72, 76, 79, 84][index % 4]), .06, label="interface tick")
for cut in [1.875, 3.75, 7.5, 10.3125, drop]:
    add("design", cut - .18, sweep(.18, False), .085, label="short transition air")

# The card has finished its diminishing rebounds at 8.20s. A quiet, dry tap
# marks physical contact, distinct from the existing request tick at 8.35s.
add("design", 8.20, landing_tap(), .18, .28, "Playwright settled contact")

# Short room reflections keep the band cohesive; no EDM pumping or long wash.
for name in ["chords", "lead"]:
    dry = stems[name].copy()
    reflections = [(.027, .065), (.051, .04), (.089, .03)]
    if name == "lead":
        reflections += [(BEAT * .75, .16), (BEAT * 1.5, .055)]
    for seconds, gain in reflections:
        delay = round(seconds * SR)
        stems[name][delay:] += filt(dry[:-delay, ::-1], 4700) * gain

# Make a little room in the guitars for the contact transient. The smooth
# 1.2dB dip ends before the request tick, preserving the band's backbeat.
duck_times = np.arange(N) / SR
duck_phase = np.clip((duck_times - 8.185) / .015, 0, 1)
duck_release = np.clip((8.30 - duck_times) / .095, 0, 1)
duck_shape = np.minimum(duck_phase, duck_release)
duck_shape = duck_shape * duck_shape * (3 - 2 * duck_shape)
duck_gain = 10 ** (-1.2 * duck_shape / 20)
for name in ["chords", "lead"]:
    stems[name] *= duck_gain[:, None]

# Taper the existing tails for a 55 ms breath before the logo downbeat.
start, end = round((drop - .055) * SR), round(drop * SR)
for name in ["drums", "bass", "chords", "lead"]:
    stems[name][start:end] *= np.linspace(1, .025, end - start)[:, None] ** 2

tail = np.ones(N)
tail_start = round(14.64 * SR)
tail[tail_start:] = np.cos(np.linspace(0, np.pi / 2, N - tail_start)) ** 1.3
mix = np.zeros((N, 2))
stem_metrics = {}
for name, sound in stems.items():
    sound[:] = filt(sound, 28, "highpass") * tail[:, None]
    wavfile.write(STEMS / f"{name}.wav", SR, sound.astype(np.float32))
    stem_metrics[name] = {"peak": float(np.max(np.abs(sound))), "rms": float(np.sqrt(np.mean(sound ** 2)))}
    mix += sound
assert np.isfinite(mix).all() and len(mix) == 720000
wavfile.write(OUT / "original-score-float.wav", SR, mix.astype(np.float32))
manifest = json.loads((SAMPLES / "manifest.json").read_text())
report = {
    "title": "Five in Motion — Full Send",
    "composition": "Original pop-rock composition and arrangement using CC0 recorded instrument one-shots",
    "bpm": BPM, "meter": "4/4", "bars": 8, "tonality": "C major", "duration": DURATION,
    "sampleRate": SR, "seed": 20260909, "dependencies": {"numpy": np.__version__, "scipy": scipy.__version__},
    "externalSamples": {"license": "CC0-1.0", "count": len(manifest["assets"]), "manifest": "assets/audio/samples/manifest.json"},
    "stems": stem_metrics, "rawPeak": float(np.max(np.abs(mix))),
    "pictureAnchors": {"five": 1.875, "task": 3.75, "call": 7.5, "playwrightSettled": 8.2, "requestArrival": 8.35, "learning": 10.3125, "logoDrop": drop, "resolve": 14.0625},
    "finalPolish": {"landingTapSeconds": .048, "landingTapGain": .18, "guitarDipDb": 1.2, "guitarDipRange": [8.185, 8.30], "logoBreathSeconds": .055},
    "events": sorted(events, key=lambda event: event["at"]),
}
(ROOT / "verification/music-composition.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Composed Full Send: {DURATION}s, {BPM} BPM, {len(events)} events, five stems.")
print(json.dumps(stem_metrics, indent=2))
