import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(project);
mkdirSync("renders", { recursive:true });
mkdirSync("verification", { recursive:true });
const source = readFileSync("index.html", "utf8");
const audioTag = /<audio\b[^>]*id="premiere-score"[^>]*><\/audio>/g;
if ([...source.matchAll(audioTag)].length !== 1) throw new Error("Expected exactly one mastered soundtrack element");
const pictureSource = source.replace(audioTag, "");
if (/<audio\b/.test(pictureSource)) throw new Error("Unexpected audio remains in picture-only render");
const temporary = ".render-picture.html";
writeFileSync(temporary, pictureSource);
writeFileSync("verification/render-plan.json", JSON.stringify({
  sourceSha256:createHash("sha256").update(source).digest("hex"),
  pictureSourceSha256:createHash("sha256").update(pictureSource).digest("hex"),
  change:"Only the single soundtrack element is omitted from the temporary picture render; all visual code is identical.",
  soundtrack:"assets/audio/full-send-final.wav", duration:15, fps:120,
}, null, 2)+"\n");

function run(command, args) {
  const result=spawnSync(command,args,{stdio:"inherit",cwd:project});
  if(result.error || result.status!==0) throw new Error(`${command} failed with status ${result.status}: ${result.error?.message ?? "see log"}`);
}
try {
  // Keep picture rendering and the original score's mastering separate and reproducible.
  run("npx", ["--yes","hyperframes@0.8.31","render","--composition",temporary,"--fps","120","--quality","high","--workers","2","--output","renders/roster-feed-picture-120fps.mp4"]);
  run("ffmpeg", ["-hide_banner","-y","-i","renders/roster-feed-picture-120fps.mp4","-i","assets/audio/full-send-final.wav",
    "-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","256k","-t","15","-movflags","+faststart","renders/roster-feed-120fps.mp4"]);
  console.log("Rendered 120fps picture and muxed the mastered original score: renders/roster-feed-120fps.mp4");
} finally {
  unlinkSync(temporary);
}
