import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(project);
mkdirSync("renders", { recursive: true });
mkdirSync("verification", { recursive: true });

const master = "renders/roster-premiere-1080p.mp4";
const preview = "renders/roster-premiere-preview.mp4";
const poster = "renders/roster-premiere-poster.png";
const contact = "renders/roster-premiere-contact-sheet.png";

function run(binary, args, logName) {
  const result = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (logName) writeFileSync(`verification/${logName}`, result.stderr ?? "");
  if (result.error || result.status !== 0) {
    throw new Error(`${binary} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result;
}

console.log("Encoding the smaller viewing copy.");
run("ffmpeg", [
  "-hide_banner", "-y", "-i", master,
  "-vf", "scale=1280:720:flags=lanczos,fps=30", "-c:v", "libx264",
  "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", preview,
], "preview-encode.log");

console.log("Extracting the poster and six frames from the encoded master.");
run("ffmpeg", [
  "-hide_banner", "-y", "-ss", "28.8", "-i", master,
  "-frames:v", "1", "-update", "1", poster,
], "poster-extract.log");

const frameIndices = [162, 405, 852, 1182, 1428, 1728];
const select = frameIndices.map((frame) => `eq(n\\,${frame})`).join("+");
run("ffmpeg", [
  "-hide_banner", "-y", "-i", master,
  "-vf", `select=${select},scale=640:360:flags=lanczos,tile=3x2:padding=8:margin=8:color=0x111210`,
  "-frames:v", "1", "-update", "1", contact,
], "contact-extract.log");

const probes = {};
for (const file of [master, preview]) {
  probes[file] = JSON.parse(run("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", file,
  ]).stdout);
}
writeFileSync("verification/media-probe.json", `${JSON.stringify(probes, null, 2)}\n`);

// Inspect the delivered encode, not only the authoring timeline or intermediate WAV.
console.log("Checking the delivered master for decode errors, blank spans and missing audio.");
const audit = run("ffmpeg", [
  "-hide_banner", "-i", master,
  "-vf", "blackdetect=d=0.12:pix_th=0.08:pic_th=0.98",
  "-af", "silencedetect=noise=-50dB:d=0.3,ebur128=peak=true",
  "-f", "null", "-",
], "encoded-master-audit.log");

const files = [master, preview, poster, contact].map((path) => {
  // The size and digest describe the same bytes, even if the file is replaced.
  const content = readFileSync(path);
  return { path, bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") };
});
const report = {
  generatedAt: new Date().toISOString(),
  files,
  representativeSeconds: frameIndices.map((frame) => frame / 60),
  detectedBlackSpans: audit.stderr.split("\n").filter((line) => line.includes("black_start:")),
  detectedSilence: audit.stderr.split("\n").filter((line) => /silence_(start|end):/.test(line)),
  loudnessSummary: audit.stderr.slice(audit.stderr.lastIndexOf("Summary:")),
};
writeFileSync("verification/delivery.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
