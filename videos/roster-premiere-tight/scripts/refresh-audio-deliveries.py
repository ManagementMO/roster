"""Replace only sound in existing approved exports, retaining encoded picture."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
meta = json.loads((ROOT / "audio_meta.json").read_text())
master = ROOT / meta["bgm"]["path"]
assert master.is_file(), "Build the soundtrack first with npm run audio."


def ffmpeg(args):
    # Fixed executable and separate argv entries; no shell interprets paths or flags.
    return subprocess.run(["ffmpeg", *args], shell=False, capture_output=True, check=True).stdout.decode()


def probe_media(file):
    output = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                             "-of", "json", str(file)], shell=False,
                            capture_output=True, check=True).stdout
    return json.loads(output)


def stream_hash(file, kind):
    return ffmpeg(["-v", "error", "-i", str(file), "-map", f"0:{kind}:0",
                "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"]).strip()


for folder, prefix in [(ROOT, "roster-tight"), (ROOT.parent / "roster-premiere-feed", "roster-feed")]:
    if folder != ROOT:
        for name in [meta["bgm"]["path"], "assets/audio/five-in-motion.m4a",
                     "assets/audio/roster-pocket-groove.m4a", "audio_meta.json"]:
            destination = folder / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, destination)
    assert f'src="{meta["bgm"]["path"]}"' in (folder / "index.html").read_text()
    records = []
    probes = {}
    for suffix in ["120fps", "60fps", "preview"]:
        file = folder / "renders" / f"{prefix}-{suffix}.mp4"
        assert file.is_file(), f"Missing approved picture: {file}"
        backup = folder / "verification/before-pocket-groove/renders" / file.name
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(file, backup)
        # Validate against the picture being refreshed. A later approved visual
        # revision can differ from the historical first-audio backup.
        before_video, before_audio = stream_hash(file, "v"), stream_hash(backup, "a")
        temporary = file.with_name(file.stem + ".audio-refresh.mp4")
        try:
            ffmpeg(["-v", "error", "-y", "-i", str(file), "-i", str(master),
                    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "256k", "-t", "15", "-movflags", "+faststart", str(temporary)])
            after_video, after_audio = stream_hash(temporary, "v"), stream_hash(temporary, "a")
            assert before_video == after_video, "Encoded picture changed during audio refresh."
            # A fresh checkout may already contain this soundtrack; refreshing it is valid.
            probe = probe_media(temporary)
            video = next(stream for stream in probe["streams"] if stream["codec_type"] == "video")
            sound = next(stream for stream in probe["streams"] if stream["codec_type"] == "audio")
            assert abs(float(probe["format"]["duration"]) - 15) < .03
            assert sound["sample_rate"] == "48000" and sound["channels"] == 2
            temporary.replace(file)
        finally:
            temporary.unlink(missing_ok=True)
        records.append({"file": str(file.relative_to(folder)), "pictureUnchanged": True,
                        "audioChangedFromBackup": before_audio != after_audio,
                        "videoStreamHash": after_video, "audioStreamHash": after_audio,
                        "duration": probe["format"]["duration"], "fps": video["avg_frame_rate"],
                        "dimensions": [video["width"], video["height"]],
                        "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
        probe["format"]["filename"] = str(file.relative_to(folder))
        probes[str(file.relative_to(folder))] = probe
    audit = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(folder / "renders" / f"{prefix}-60fps.mp4"),
                            "-vn", "-af", "loudnorm=I=-14:TP=-2:LRA=7:print_format=json,silencedetect=noise=-50dB:d=0.15",
                            "-f", "null", "-"], capture_output=True, check=True).stderr.decode()
    start = audit.rfind('{\n')
    loudness = json.JSONDecoder().raw_decode(audit[start:])[0]
    assert float(loudness["input_tp"]) <= -1.0, "AAC reconstruction needs more headroom."
    assert abs(float(loudness["input_i"]) + 14) <= .5
    silence = re.findall(r"silence_start: ([\d.]+)", audit)
    assert not any(float(at) < 14.5 for at in silence), "Unexpected gap in the soundtrack."
    report = {"soundtrack": meta["bgm"]["path"], "outputs": records,
              "encodedAudioMeasurement": loudness, "silenceStarts": silence,
              "method": "Replace audio with FFmpeg stream-copy picture; compare encoded video hashes with the input exports, and audio with the retained first-refresh backups."}
    (folder / "verification/pocket-groove-delivery.json").write_text(json.dumps(report, indent=2) + "\n")
    # Remuxing can change container bytes even when both encoded streams are
    # identical. Keep the general delivery sidecars aligned with the final files.
    delivery_path = folder / "verification/delivery.json"
    if delivery_path.exists():
        delivery = json.loads(delivery_path.read_text())
        by_path = {record["file"]: record for record in records}
        for item in delivery["files"]:
            if item["path"] in by_path:
                item["sha256"] = by_path[item["path"]]["sha256"]
                item["bytes"] = (folder / item["path"]).stat().st_size
        delivery_path.write_text(json.dumps(delivery, indent=2) + "\n")
    probe_path = folder / "verification/media-probe.json"
    if probe_path.exists():
        existing_probes = json.loads(probe_path.read_text())
        existing_probes.update(probes)
        probe_path.write_text(json.dumps(existing_probes, indent=2) + "\n")
    print(json.dumps({"project": folder.name, "exports": len(records), "pictureUnchanged": True,
                      "lufs": loudness["input_i"], "truePeakDbtp": loudness["input_tp"]}))
