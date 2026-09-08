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
if (start !== 15 || scenes.length !== 6) throw new Error(`Expected six scenes totaling 15 seconds, got ${scenes.length}/${start}`);

const mounts = scenes.map(s => `    <div id="${s.wrapper}" class="seam">
      <div id="el-${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="${s.src}" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1" data-width="1920" data-height="1080"></div>
    </div>`).join("\n");
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Roster — The starting five, distilled</title>
  <script src="assets/gsap.min.js"></script>
  <style>
    @font-face { font-family:"Space Grotesk";src:url("assets/SpaceGrotesk-Variable.woff2") format("woff2");font-weight:300 700;font-style:normal; }
    @font-face { font-family:"Manrope";src:url("assets/Manrope-Variable.woff2") format("woff2");font-weight:200 800;font-style:normal; }
    * { box-sizing:border-box; }
    html,body { margin:0;padding:0;width:1920px;height:1080px;overflow:hidden; }
    #root { position:relative;width:1920px;height:1080px;overflow:hidden;color:#F7F8FC; }
    .clip,.seam { position:absolute;inset:0;width:1920px;height:1080px; }
    .seam { transform-origin:50% 50%; }
    #stage-ground { position:absolute;inset:0;background:#151B29; }
    #handoff-card { position:absolute;left:0;top:0;width:378px;height:236px;color:#172033;transform-origin:189px 118px; }
    #handoff-surface { position:absolute;inset:0;width:378px;height:236px;background:#DFE7FB;transform-origin:0 0;border-radius:24px; }
    #handoff-outline { position:absolute;inset:0;width:378px;height:236px;border:2px solid #4963DF;border-radius:24px;opacity:0; }
    #handoff-plate { position:absolute;left:0;top:0;width:44px;height:44px;background:#F7F8FC;border-radius:9px;transform-origin:0 0; }
    #handoff-logo { position:absolute;left:0;top:0;width:111px;height:111px;background:url("assets/brands/playwright.svg") center/contain no-repeat;transform-origin:0 0; }
    #handoff-source { position:absolute;inset:0;width:976px;height:78px;font-family:"Manrope"; }
    #handoff-title { position:absolute;left:92px;top:9.5px;font-size:48px;font-weight:600;line-height:58px;letter-spacing:-1.3px;white-space:nowrap; }
    #handoff-provider { position:absolute;left:708px;top:17.5px;width:192px;font-size:30px;font-weight:500;line-height:42px;text-align:right;white-space:nowrap; }
    #handoff-arrow { position:absolute;left:918px;top:21.5px;width:34px;height:34px; }
    #handoff-name { position:absolute;left:145px;top:96px;font-family:"Space Grotesk";font-size:43px;font-weight:700;line-height:1;letter-spacing:-1.7px;white-space:nowrap;opacity:0; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="15" data-fps="120" data-width="1920" data-height="1080">
    <div id="stage-ground" class="clip" data-start="0" data-duration="15" data-track-index="0"></div>
${mounts}
    <div id="playwright-handoff" class="clip" data-start="7.1" data-duration="1.125" data-track-index="5" data-width="1920" data-height="1080">
      <div id="handoff-card">
        <div id="handoff-surface"></div>
        <div id="handoff-outline"></div>
        <div id="handoff-plate"></div>
        <span id="handoff-logo" role="img" aria-label="Playwright"></span>
        <div id="handoff-source">
          <span id="handoff-title">Inspect page</span>
          <span id="handoff-provider">Playwright</span>
          <svg id="handoff-arrow" viewBox="0 0 34 34" fill="none" aria-hidden="true"><path d="M5 17H28M18 7L28 17L18 27" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </div>
        <div id="handoff-name">Playwright</div>
      </div>
    </div>
    <audio id="premiere-score" class="clip" src="assets/audio/full-send-final.wav" data-start="0" data-duration="15" data-track-index="10" data-volume="1"></audio>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
    // Match the stationary underlay to each scene, including the pearl gradient.
    const pearl = "radial-gradient(ellipse at 88% 15%,#DCE6F9 0%,#EDF1FA 32%,#F7F8FC 72%)";
    tl.set("#stage-ground", { backgroundColor:"#151B29", backgroundImage:"none" }, 0);
    tl.set("#stage-ground", { backgroundColor:"#F7F8FC", backgroundImage:pearl }, 1.875);
    tl.set("#stage-ground", { backgroundColor:"#F7F8FC", backgroundImage:pearl }, 3.75);
    tl.set("#stage-ground", { backgroundColor:"#151B29", backgroundImage:"none" }, 7.5);
    tl.set("#stage-ground", { backgroundColor:"#F7F8FC", backgroundImage:pearl }, 10.3125);
    tl.set("#stage-ground", { backgroundColor:"#151B29", backgroundImage:"none" }, 12.1875);

    // One master-owned surface and full-color logo cross the scene boundary.
    // Coordinates are fixed from the 1920x1080 design: selected row (812,574),
    // then the route endpoint (1434,412). Only the surface scales; type and logo
    // keep their own proportions. Source hides at 7.10; destination shows at 8.225.
    // Explicit elliptical corners compensate for the surface's nonuniform scale.
    // GSAP's borderRadius shorthand cannot preserve the slash-form ellipse.
    const rowCorners = { borderTopLeftRadius:"9.295px 72.615px", borderTopRightRadius:"9.295px 72.615px", borderBottomRightRadius:"9.295px 72.615px", borderBottomLeftRadius:"9.295px 72.615px" };
    const nodeCorners = { borderTopLeftRadius:"24px 24px", borderTopRightRadius:"24px 24px", borderBottomRightRadius:"24px 24px", borderBottomLeftRadius:"24px 24px" };
    tl.set("#handoff-card", { x:812, y:574, rotation:0, scale:1 }, 0);
    tl.set("#handoff-surface", { scaleX:976/378, scaleY:78/236, ...rowCorners, backgroundColor:"#DFE7FB" }, 0);
    tl.set("#handoff-plate", { x:24, y:16.5, opacity:1 }, 0);
    tl.set("#handoff-logo", { x:27, y:19.5, scale:38/111 }, 0);
    tl.set("#handoff-source", { opacity:1 }, 0);
    // The user requested a softer, slightly playful landing. Give vertical
    // motion a small lead, bank into the arrival, then lose energy in two
    // diminishing rebounds. Every turning point has zero velocity; there is
    // no hard stop, looping spring simulation, stretched type or logo squash.
    // The 1.10s movement spans 132 native frames; the request arrives at 8.35s.
    tl.fromTo("#handoff-card", { x:812 }, { x:1452, duration:0.5, ease:"power3.inOut", immediateRender:false }, 7.1);
    tl.fromTo("#handoff-card", { y:574 }, { y:398.8, duration:0.46, ease:"power3.inOut", immediateRender:false }, 7.1);
    tl.fromTo("#handoff-card", { rotation:0 }, { rotation:-0.9, duration:0.25, ease:"sine.inOut", immediateRender:false }, 7.1);
    tl.to("#handoff-card", { rotation:1.7, duration:0.25, ease:"sine.inOut" }, 7.35);
    tl.fromTo("#handoff-card", { scale:1 }, { scale:1.0175, duration:0.225, ease:"sine.inOut", immediateRender:false }, 7.375);
    tl.to("#handoff-card", { y:416.8, duration:0.22, ease:"sine.inOut" }, 7.56);
    tl.to("#handoff-card", { x:1428.2, rotation:-0.65, scale:0.995, duration:0.18, ease:"sine.inOut" }, 7.6);
    tl.to("#handoff-card", { x:1435.7, y:410.6, rotation:0.2, scale:1.0024, duration:0.18, ease:"sine.inOut" }, 7.78);
    tl.to("#handoff-card", { x:1434, y:412, rotation:0, scale:1, duration:0.24, ease:"sine.inOut" }, 7.96);
    tl.fromTo("#handoff-surface", { scaleX:976/378, scaleY:78/236, ...rowCorners, backgroundColor:"#DFE7FB" }, { scaleX:1, scaleY:1, ...nodeCorners, backgroundColor:"#F7F8FC", duration:0.5, ease:"power3.inOut", immediateRender:false }, 7.1);
    tl.fromTo("#handoff-logo", { x:27, y:19.5, scale:38/111 }, { x:27, y:60, scale:1, duration:0.5, ease:"power3.inOut", immediateRender:false }, 7.1);
    tl.fromTo("#handoff-source, #handoff-plate", { opacity:1 }, { opacity:0, duration:0.12, ease:"power2.in", immediateRender:false }, 7.1);
    tl.fromTo("#handoff-name", { opacity:0, y:6 }, { opacity:1, y:0, duration:0.2, ease:"power3.out", immediateRender:false }, 7.4);
    tl.fromTo("#handoff-outline", { opacity:0 }, { opacity:1, duration:0.02, ease:"none", immediateRender:false }, 7.58);
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
fs.writeFileSync(path.join(project, "timeline.json"), JSON.stringify({duration: start, fps: 120, width: 1920, height: 1080, scenes}, null, 2) + "\n");
console.log(`Built ${scenes.length} scenes, ${start}s, 1920x1080 at 120 fps.`);
