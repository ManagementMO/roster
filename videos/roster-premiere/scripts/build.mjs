import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storyboard = fs.readFileSync(path.join(project, "STORYBOARD.md"), "utf8");
const sections = storyboard.split(/^## Frame /m).slice(1);
let start = 0;
const scenes = sections.map((section, i) => {
  const src = section.match(/^- src:\s*(.+)$/m)?.[1].trim();
  const duration = Number(section.match(/^- duration:\s*([\d.]+)s/m)?.[1]);
  if (!src || !Number.isFinite(duration)) throw new Error(`Frame ${i + 1} has no source or duration`);
  const html = fs.readFileSync(path.join(project, src), "utf8");
  const id = path.basename(src, ".html");
  if (!html.includes(`data-composition-id="${id}"`) || !html.includes(`__timelines["${id}"]`)) {
    throw new Error(`Composition/timeline identity mismatch in ${src}`);
  }
  const scene = { id, src, start, duration, wrapper: `seam-${String(i + 1).padStart(2, "0")}` };
  start += duration;
  return scene;
});
if (start !== 30 || scenes.length !== 6) throw new Error(`Expected six scenes totaling 30 seconds, got ${scenes.length}/${start}`);

const mounts = scenes.map(s => `    <div id="${s.wrapper}" class="seam">
      <div id="el-${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="${s.src}" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1" data-width="1920" data-height="1080"></div>
    </div>`).join("\n");
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Roster — The starting five</title>
  <script src="assets/gsap.min.js"></script>
  <style>
    * { box-sizing:border-box; }
    html,body { margin:0;padding:0;width:1920px;height:1080px;overflow:hidden; }
    #root { position:relative;width:1920px;height:1080px;overflow:hidden;color:#F4F1E9; }
    .clip,.seam { position:absolute;inset:0;width:1920px;height:1080px; }
    .seam { transform-origin:50% 50%; }
    #stage-ground { position:absolute;inset:0;background:#111210; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="30" data-fps="60" data-width="1920" data-height="1080">
    <div id="stage-ground" class="clip" data-start="0" data-duration="30" data-track-index="0"></div>
${mounts}
    <audio id="premiere-score" class="clip" src="assets/audio/premiere-score.wav" data-start="0" data-duration="30" data-track-index="10" data-volume="1"></audio>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
    // <seams:auto>
    // </seams:auto>
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(project, "index.html"), html);

// Seam code is generated from the same reviewable vector ledger that the gate measures.
const stamp = path.join(project, "scripts/seam-stamp.mjs");
const stamped = spawnSync(process.execPath, [stamp, "--ledger", "ledger.json", "--write", "index.html"], {cwd: project, stdio: "inherit"});
if (stamped.status !== 0) process.exit(stamped.status ?? 1);
fs.writeFileSync(path.join(project, "timeline.json"), JSON.stringify({duration: start, fps: 60, width: 1920, height: 1080, scenes}, null, 2) + "\n");
console.log(`Built ${scenes.length} scenes, ${start}s, 1920x1080 at 60 fps.`);
