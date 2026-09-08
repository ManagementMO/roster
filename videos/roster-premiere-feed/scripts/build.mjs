import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// A dedicated 4:5 composition, sharing original artwork and beat times with
// the widescreen film. Every layout below is composed for 1080 x 1350.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wide = path.resolve(project, "../roster-premiere-tight");
const write = (name, data) => {
  const dest = path.join(project, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
};
const copy = (name) => {
  const dest = path.join(project, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(wide, name), dest);
};
for (const file of ["SpaceGrotesk-Variable.woff2", "Manrope-Variable.woff2", "JetBrainsMono-Variable.woff2", "gsap.min.js", "roster-mark-pearl.svg", "roster-wordmark-pearl.svg"]) copy(`assets/${file}`);
for (const file of fs.readdirSync(path.join(wide, "assets"))) {
  if (/license|ofl/i.test(file) && fs.statSync(path.join(wide, "assets", file)).isFile()) copy(`assets/${file}`);
}
fs.cpSync(path.join(wide, "assets/brands"), path.join(project, "assets/brands"), { recursive: true });
for (const name of ["full-send-final.wav", "full-send-score.wav", "five-in-motion.m4a", "five-in-motion-full-send.m4a"]) copy(`assets/audio/${name}`);
for (const name of ["hyperframes.json", "ledger.json", "index.motion.json", "audio_meta.json", "scripts/seam-stamp.mjs", "scripts/verify-seams.mjs"]) copy(name);
for (const name of ["render", "deliver"]) {
  const source = fs.readFileSync(path.join(wide, `scripts/${name}.mjs`), "utf8")
    .replaceAll("roster-tight", "roster-feed")
    .replaceAll("scale=1280:720", "scale=864:1080")
    .replaceAll("scale=640:360", "scale=360:450");
  write(`scripts/${name}.mjs`, source);
}
write("scripts/seam-gate.mjs", fs.readFileSync(path.join(wide, "scripts/seam-gate.mjs"), "utf8")
  .replaceAll("--window-size=1920,1080", "--window-size=1080,1350")
  .replaceAll("width: 1920, height: 1080", "width: 1080, height: 1350")
  .replaceAll("r.left < 1920 && r.top < 1080", "r.left < 1080 && r.top < 1350"));

const ids = ["01-overload", "02-five", "03-draft", "04-call", "05-learn", "06-identity"];
const durations = [1.875, 1.875, 3.75, 2.8125, 1.875, 2.8125];
const starts = [0, 1.875, 3.75, 7.5, 10.3125, 12.1875];
const sourceHashes = {};
function frame(id, overrides, transform = (html) => html, timeline = null) {
  const source = fs.readFileSync(path.join(wide, `compositions/frames/${id}.html`), "utf8");
  sourceHashes[id] = createHash("sha256").update(source).digest("hex");
  let html = source.replace(/width:\s*1920px/g, "width:1080px")
    .replace(/height:\s*1080px/g, "height:1350px")
    .replaceAll('data-width="1920"', 'data-width="1080"')
    .replaceAll('data-height="1080"', 'data-height="1350"')
    .replaceAll('viewBox="0 0 1920 1080"', 'viewBox="0 0 1080 1350"');
  html = transform(html);
  html = html.replace("</style>", `\n/* Dedicated feed composition. */\n${overrides}\n</style>`);
  if (timeline) html = html.replace(/<script>[\s\S]*?<\/script>/, `<script>\n${timeline}\n</script>`);
  write(`compositions/frames/${id}.html`, html);
}
function position(html, id, styles) {
  const re = new RegExp(`(<[^>]+\\bid="${id}"[^>]*?)\\sstyle="[^"]*"`);
  if (!re.test(html)) throw new Error(`Missing positioned feed element: ${id}`);
  return html.replace(re, `$1 style="${styles}"`);
}

frame("01-overload", `
  #s01-eyebrow { left:76px;top:88px;font-size:38px;line-height:52px; }
  #s01-count { left:53px;top:177px;width:970px;height:438px;font-size:450px;transform-origin:50% 50%; }
  #s01-tools { left:71px;top:623px;font-size:126px; }
  #s01-slash { left:76px;top:762px;width:648px;height:32px; }
  .s01-tile { border-radius:24px;gap:14px; }
  .s01-tile .s01-brand { width:92px;height:92px; }
  #s01-tile-06 .s01-brand { width:112px;height:112px; }
  .s01-tile-label { font-size:26px;line-height:34px;letter-spacing:-.6px; }
`, (html) => {
  const positions = [[76,850], [319,856], [564,844], [807,858], [82,1090], [321,1082], [568,1094], [803,1085]];
  positions.forEach(([x,y], i) => {
    html = position(html, `s01-tile-${String(i+1).padStart(2,"0")}`, `left:${x}px;top:${y}px;width:190px;height:190px;z-index:${8-i};`);
  });
  return html;
});

frame("02-five", `
  #s02-only { left:80px;top:106px;font-size:86px; }
  #s02-five { left:55px;top:238px;width:970px;height:348px;font-size:358px;transform-origin:50% 50%; }
  #s02-start { left:78px;top:613px;font-size:102px; }
  #s02-roster { left:910px;top:95px;width:80px;height:80px;padding:4px;border-radius:16px; }
  #s02-lineup { left:0;top:790px;width:1080px;height:452px; }
  .s02-tile { width:280px;height:206px;gap:20px; }
  .s02-glyph { width:88px;height:88px; }
  .s02-label { font-size:36px;line-height:44px; }
`, (html) => {
  const names = ["code","files","browser","issues","skills"];
  const positions = [[76,0],[400,0],[724,0],[238,246],[562,246]];
  names.forEach((name,i) => html = position(html, `s02-${name}`, `left:${positions[i][0]}px;top:${positions[i][1]}px;`));
  return html;
});

const draftTimeline = `
(() => {
  const timeline = gsap.timeline({ paused:true });
  window.__timelines = window.__timelines || {};
  window.__timelines["03-draft"] = timeline;
  // The input remains one object as it settles into the full-width shortlist.
  gsap.set("#s03-panel-surface", { opacity:0, y:190, scaleY:.2 });
  gsap.set("#s03-api", { opacity:0 });
  gsap.set("#s03-task-chip", { y:160 });
  timeline.fromTo("#s03-one-task", { y:234, opacity:.6 }, { y:220, opacity:1, duration:.22, ease:"power3.out" }, 0);
  timeline.fromTo(".s03-task-char", { opacity:0, x:2 }, { opacity:1, x:0, duration:.11, stagger:.008, ease:"power2.out" }, .06);
  timeline.to("#s03-submit", { x:8, duration:.08, ease:"power2.in" }, .82);
  timeline.to("#s03-submit", { x:0, duration:.22, ease:"power3.out" }, .90);
  timeline.to("#s03-task-chip", { y:0, duration:.60, ease:"power3.inOut" }, .82);
  timeline.set("#s03-panel-surface", { opacity:1 }, .82);
  timeline.to("#s03-panel-surface", { y:0, scaleY:1, duration:.60, ease:"power3.inOut" }, .82);
  timeline.to("#s03-api", { opacity:1, duration:.20, ease:"power3.out" }, 1.16);
  timeline.to("#s03-one-task", { y:196, opacity:0, duration:.20, ease:"power2.in" }, .84);
  ["the","right","tools"].forEach((name,i) => timeline.fromTo("#s03-title-"+name,
    { x:18,y:12,opacity:0 }, { x:0,y:0,opacity:1,duration:.18,ease:"power3.out" }, 1.10+i*.085));
  const rows = ["code","files","inspect","issues","skill"];
  const cues = [1.45,1.56,1.66,1.75,1.83];
  rows.forEach((row,i) => timeline.fromTo("#s03-row-"+row, { x:18,y:8,opacity:0 }, { x:0,y:0,opacity:1,duration:.30,ease:"power3.out" }, cues[i]));
  timeline.fromTo("#s03-inspect-fill", { opacity:0,scaleX:.98 }, { opacity:1,scaleX:1,duration:.24,ease:"power3.out" }, 2.60);
  timeline.to("#s03-inspect-title-light, #s03-inspect-provider-light", { color:"#172033",duration:.20,ease:"power2.out" }, 2.60);
  timeline.to("#s03-row-inspect", { x:-12,duration:.30,ease:"power3.out" }, 2.60);
  timeline.to("#s03-row-code .s03-row-title, #s03-row-code .s03-row-provider, #s03-row-files .s03-row-title, #s03-row-files .s03-row-provider, #s03-row-issues .s03-row-title, #s03-row-issues .s03-row-provider, #s03-row-skill .s03-row-title, #s03-row-skill .s03-row-provider", { opacity:.68,duration:.24,ease:"power2.out" }, 2.62);
  timeline.fromTo("#s03-workflow-note", { y:8,opacity:0 }, { y:0,opacity:1,duration:.24,ease:"power3.out" }, 1.16);
  timeline.fromTo("#s03-selection-arrow", { x:-8,opacity:0 }, { x:0,opacity:1,duration:.18,ease:"power3.out" }, 2.70);
  timeline.set("#s03-row-inspect", { opacity:0 }, 3.35);
  timeline.to("#s03-row-code, #s03-row-files, #s03-row-issues, #s03-row-skill", { x:-8,opacity:0,duration:.17,ease:"power2.in" }, 3.35);
})();`;
frame("03-draft", `
  #s03-mode { left:676px;top:74px;width:332px;height:44px;font-size:30px;line-height:44px; }
  #s03-one-task { left:68px;top:150px;width:946px;height:170px;font-size:148px;letter-spacing:-6.5px; }
  #s03-panel-surface { left:68px;top:440px;width:944px;height:744px; }
  #s03-task-chip { left:88px;top:472px;width:904px;height:100px;border-radius:18px; }
  #s03-task-text { left:26px;top:18px;width:790px;height:64px;font-size:48px;line-height:64px;letter-spacing:-1.5px; }
  #s03-submit { right:24px;top:28px;width:44px;height:44px; }
  #s03-api { left:100px;top:596px;width:868px;height:44px;font-size:27px;line-height:44px; }
  #s03-right-tools { left:68px;top:150px;width:944px;height:270px;font-size:126px;line-height:1;letter-spacing:-5.5px; }
  .s03-title-line { width:auto;height:132px; }
  #s03-title-the, #s03-title-right { display:inline-block; }
  #s03-title-the { margin-right:24px; }
  #s03-title-tools { display:block; }
  #s03-candidates { left:100px;top:660px;width:904px;height:488px; }
  .s03-row { width:904px;height:88px;grid-template-columns:50px 1fr 174px 34px; }
  #s03-row-code { top:0; } #s03-row-files { top:100px; } #s03-row-inspect { top:200px; }
  #s03-row-issues { top:300px; } #s03-row-skill { top:400px; }
  .s03-row-title { width:500px;font-size:48px;line-height:58px; }
  .s03-row-provider { font-size:30px;line-height:42px; }
  #s03-inspect-fill { width:904px;height:88px; }
  #s03-workflow-note { left:76px;top:1244px;width:900px;font-size:28px;line-height:40px; }
`, (html) => html, draftTimeline);

frame("04-call", `
  #s04-head-call, #s04-head-result { left:68px;top:72px;width:944px;font-size:142px;line-height:184px;letter-spacing:-6px;white-space:normal; }
  .s04-head-line { display:block; }
  #s04-illustrative { left:76px;top:464px;font-size:28px;line-height:40px;letter-spacing:1.5px; }
  #s04-agent { left:64px;top:548px;width:208px;height:228px;font-size:50px; }
  #s04-roster { left:394px;top:548px;width:292px;height:228px; }
  #s04-logo { left:84px;top:18px;width:120px;height:120px; }
  #s04-roster-name { left:0;top:150px;width:288px;text-align:center;font-size:50px;letter-spacing:-2px; }
  #s04-playwright { left:808px;top:548px;width:208px;height:228px; }
  #s04-playwright-logo { left:54px;top:30px;width:96px;height:96px; }
  #s04-playwright-name { left:0;top:150px;width:204px;text-align:center;font-size:36px;letter-spacing:-1.3px; }
  #s04-request-rail-left { left:262px;top:662px;width:140px; }
  #s04-request-rail-right { left:682px;top:662px;width:136px; }
  #s04-request-packet { left:236px;top:654px;width:60px;height:16px; }
  #s04-return-packet { left:864px;top:762px;width:80px;height:16px; }
  #s04-result-card { left:68px;top:957px;width:944px;height:154px;gap:28px;padding:0 42px; }
  #s04-document { width:52px;height:58px;flex-basis:52px; }
  #s04-payload { font-size:48px;font-weight:650; }
  #s04-api { left:76px;top:1202px;font-size:28px;line-height:44px;letter-spacing:-.5px; }
`, (html) => html
  .replace('id="s04-head-call">MAKE THE CALL.</h1>', 'id="s04-head-call"><span class="s04-head-line">MAKE THE</span><span class="s04-head-line">CALL.</span></h1>')
  .replace('id="s04-head-result">RESULT. RETURNED.</h1>', 'id="s04-head-result"><span class="s04-head-line">RESULT.</span><span class="s04-head-line">RETURNED.</span></h1>')
  .replace('d="M 1613 637 L 1613 663 Q 1613 718 1558 718 L 292 718 Q 220 718 220 648"', 'd="M 912 770 L 912 808 Q 912 864 856 864 L 224 864 Q 168 864 168 780"')
  .replace('x: 1192', 'x: 650')
  .replace('{ x: 0, y: 24,', '{ x: 0, y: 30,')
  .replace('{ x: -56, y: 80,', '{ x: -56, y: 94,')
  .replace('{ x: -1321, y: 80,', '{ x: -688, y: 94,')
  .replace('{ x: -1393, y: 10,', '{ x: -736, y: 10,'));

frame("05-learn", `
  #s05-headline { left:68px;top:76px;width:944px;font-size:140px;line-height:.94;letter-spacing:-6.3px; }
  #s05-coach { left:68px;top:516px;width:944px;height:480px; }
  #s05-roster-logo { left:32px;top:25px;width:80px;height:80px; }
  #s05-coach-label { left:124px;top:43px;font-size:46px; }
  #s05-success, #s05-errors, #s05-latency { left:40px;width:420px;height:80px;padding-left:32px;font-size:42px; }
  #s05-success { top:150px; } #s05-errors { top:248px; } #s05-latency { top:346px; }
  #s05-database { left:634px;top:165px;width:226px;height:256px; }
  #s05-next-draft { left:670px;top:1030px;width:342px;height:78px;font-size:38px; }
  #s05-machine { left:68px;top:1145px;width:944px;font-size:82px;letter-spacing:-3.6px; }
  #s05-support { left:76px;top:1250px;width:928px;font-size:34px;line-height:44px; }
`, (html) => html.replace('d="M 1462 561 L 1462 602 Q 1462 647 1507 647 L 1796 647"', 'd="M 840 981 L 840 1002 Q 840 1069 900 1069 L 990 1069"'));

frame("06-identity", `
  #s06-mark { left:378px;top:246px;width:324px;height:324px; }
  #s06-word { left:68px;top:592px;width:944px;height:262.87px; }
  #s06-rule { left:98px;top:912px;width:884px;height:5px; }
  #s06-tagline { left:68px;top:982px;width:944px;height:76px;font-size:52px;line-height:76px;letter-spacing:-1px; }
  #s06-link { left:68px;top:1120px;width:944px;height:72px;font-size:48px;line-height:72px;letter-spacing:-.7px; }
`);

// The portrait carrier starts at the selected full-width row, then lands in
// the right-hand route node. The same gentle 1.10s settle and audio cues apply.
const mounts = ids.map((id,i) => `
    <div id="seam-${String(i+1).padStart(2,"0")}" class="seam">
      <div id="el-${id}" class="clip" data-composition-id="${id}" data-composition-src="compositions/frames/${id}.html" data-start="${starts[i]}" data-duration="${durations[i]}" data-track-index="1" data-width="1080" data-height="1350"></div>
    </div>`).join("\n");
const html = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Roster — The starting five · Feed edition</title>
  <script src="assets/gsap.min.js"></script>
  <style>
    @font-face { font-family:"Space Grotesk";src:url("assets/SpaceGrotesk-Variable.woff2") format("woff2");font-weight:300 700; }
    @font-face { font-family:"Manrope";src:url("assets/Manrope-Variable.woff2") format("woff2");font-weight:200 800; }
    * { box-sizing:border-box; } html,body { margin:0;padding:0;width:1080px;height:1350px;overflow:hidden; }
    #root { position:relative;width:1080px;height:1350px;overflow:hidden;color:#F7F8FC; }
    .clip,.seam { position:absolute;inset:0;width:1080px;height:1350px; } .seam { transform-origin:50% 50%; }
    #stage-ground { position:absolute;inset:0;background:#151B29; }
    #handoff-card { position:absolute;left:0;top:0;width:208px;height:228px;color:#172033;transform-origin:104px 114px; }
    #handoff-surface { position:absolute;inset:0;width:208px;height:228px;background:#DFE7FB;transform-origin:0 0;border-radius:24px; }
    #handoff-outline { position:absolute;inset:0;width:208px;height:228px;border:2px solid #4963DF;border-radius:24px;opacity:0; }
    #handoff-plate { position:absolute;left:0;top:0;width:44px;height:44px;background:#F7F8FC;border-radius:9px;transform-origin:0 0; }
    #handoff-logo { position:absolute;left:0;top:0;width:96px;height:96px;background:url("assets/brands/playwright.svg") center/contain no-repeat;transform-origin:0 0; }
    #handoff-source { position:absolute;inset:0;width:904px;height:88px;font-family:"Manrope"; }
    #handoff-title { position:absolute;left:92px;top:14.5px;font-size:48px;font-weight:600;line-height:58px;letter-spacing:-1.3px;white-space:nowrap; }
    #handoff-provider { position:absolute;left:654px;top:22.5px;width:174px;font-size:30px;font-weight:500;line-height:42px;text-align:right;white-space:nowrap; }
    #handoff-arrow { position:absolute;left:846px;top:26.5px;width:34px;height:34px; }
    #handoff-name { position:absolute;left:0;top:152px;width:208px;font-family:"Space Grotesk";font-size:36px;font-weight:700;line-height:1;letter-spacing:-1.3px;text-align:center;white-space:nowrap;opacity:0; }
  </style>
</head><body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="15" data-fps="120" data-width="1080" data-height="1350">
    <div id="stage-ground" class="clip" data-start="0" data-duration="15" data-track-index="0"></div>
    ${mounts}
    <div id="playwright-handoff" class="clip" data-start="7.1" data-duration="1.125" data-track-index="5" data-width="1080" data-height="1350">
      <!-- The carrier deliberately begins as a 904px row before becoming a 208px route node. -->
      <div id="handoff-card" data-layout-allow-overflow="">
        <div id="handoff-surface"></div><div id="handoff-outline"></div><div id="handoff-plate"></div>
        <span id="handoff-logo" role="img" aria-label="Playwright"></span>
        <div id="handoff-source"><span id="handoff-title">Inspect page</span><span id="handoff-provider">Playwright</span>
          <svg id="handoff-arrow" viewBox="0 0 34 34" fill="none" aria-hidden="true"><path d="M5 17H28M18 7L28 17L18 27" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </div>
        <div id="handoff-name">Playwright</div>
      </div>
    </div>
    <audio id="premiere-score" class="clip" src="assets/audio/full-send-final.wav" data-start="0" data-duration="15" data-track-index="10" data-volume="1"></audio>
  </div>
  <script>
    const tl = gsap.timeline({ paused:true });
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
    const pearl = "radial-gradient(ellipse at 88% 15%,#DCE6F9 0%,#EDF1FA 32%,#F7F8FC 72%)";
    [0,7.5,12.1875].forEach(t => tl.set("#stage-ground", { backgroundColor:"#151B29",backgroundImage:"none" }, t));
    [1.875,3.75,10.3125].forEach(t => tl.set("#stage-ground", { backgroundColor:"#F7F8FC",backgroundImage:pearl }, t));
    const rowCorners = { borderTopLeftRadius:"5.522px 62.182px",borderTopRightRadius:"5.522px 62.182px",borderBottomRightRadius:"5.522px 62.182px",borderBottomLeftRadius:"5.522px 62.182px" };
    const nodeCorners = { borderTopLeftRadius:"24px 24px",borderTopRightRadius:"24px 24px",borderBottomRightRadius:"24px 24px",borderBottomLeftRadius:"24px 24px" };
    tl.set("#handoff-card", { x:88,y:860,rotation:0,scale:1 }, 0);
    tl.set("#handoff-surface", { scaleX:904/208,scaleY:88/228,...rowCorners,backgroundColor:"#DFE7FB" }, 0);
    tl.set("#handoff-plate", { x:24,y:21.5,opacity:1 }, 0);
    tl.set("#handoff-logo", { x:27,y:24.5,scale:38/96 }, 0);
    tl.set("#handoff-source", { opacity:1 }, 0);
    tl.fromTo("#handoff-card", { x:88 }, { x:826,duration:.5,ease:"power3.inOut",immediateRender:false }, 7.1);
    tl.fromTo("#handoff-card", { y:860 }, { y:534.8,duration:.46,ease:"power3.inOut",immediateRender:false }, 7.1);
    tl.fromTo("#handoff-card", { rotation:0 }, { rotation:-.9,duration:.25,ease:"sine.inOut",immediateRender:false }, 7.1);
    tl.to("#handoff-card", { rotation:1.7,duration:.25,ease:"sine.inOut" }, 7.35);
    tl.fromTo("#handoff-card", { scale:1 }, { scale:1.0175,duration:.225,ease:"sine.inOut",immediateRender:false }, 7.375);
    tl.to("#handoff-card", { y:552.8,duration:.22,ease:"sine.inOut" }, 7.56);
    tl.to("#handoff-card", { x:802.2,rotation:-.65,scale:.995,duration:.18,ease:"sine.inOut" }, 7.6);
    tl.to("#handoff-card", { x:809.7,y:546.6,rotation:.2,scale:1.0024,duration:.18,ease:"sine.inOut" }, 7.78);
    tl.to("#handoff-card", { x:808,y:548,rotation:0,scale:1,duration:.24,ease:"sine.inOut" }, 7.96);
    tl.fromTo("#handoff-surface", { scaleX:904/208,scaleY:88/228,...rowCorners,backgroundColor:"#DFE7FB" }, { scaleX:1,scaleY:1,...nodeCorners,backgroundColor:"#F7F8FC",duration:.5,ease:"power3.inOut",immediateRender:false }, 7.1);
    tl.fromTo("#handoff-logo", { x:27,y:24.5,scale:38/96 }, { x:56,y:32,scale:1,duration:.5,ease:"power3.inOut",immediateRender:false }, 7.1);
    tl.fromTo("#handoff-source, #handoff-plate", { opacity:1 }, { opacity:0,duration:.12,ease:"power2.in",immediateRender:false }, 7.1);
    tl.fromTo("#handoff-name", { opacity:0,y:6 }, { opacity:1,y:0,duration:.2,ease:"power3.out",immediateRender:false }, 7.4);
    tl.fromTo("#handoff-outline", { opacity:0 }, { opacity:1,duration:.02,ease:"none",immediateRender:false }, 7.58);
    // <seams:auto>
    // </seams:auto>
  </script>
</body></html>`;
write("index.html", html);
const stamped = spawnSync(process.execPath, ["scripts/seam-stamp.mjs", "--ledger", "ledger.json", "--write", "index.html"], { cwd:project,stdio:"inherit" });
if (stamped.status !== 0) process.exit(stamped.status ?? 1);
write("timeline.json", JSON.stringify({ duration:15,fps:120,width:1080,height:1350,scenes:ids.map((id,i)=>({id,src:`compositions/frames/${id}.html`,start:starts[i],duration:durations[i]})) },null,2)+"\n");
write("verification/source-manifest.json", JSON.stringify({ canonicalProject:"../roster-premiere-tight",sourceHashes,format:"1080x1350",adaptation:"Dedicated scene layouts, independent portrait carrier path, shared artwork and score." },null,2)+"\n");
console.log("Built six separately composed feed scenes: 1080x1350, 15 seconds, native 120 fps.");
