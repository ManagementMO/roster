import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import collection from "@iconify-json/tabler/icons.json" with { type: "json" };
import { release } from "../src/lib/site.ts";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const image = (file) => `data:image/svg+xml;base64,${fs.readFileSync(path.join(publicDir, file)).toString("base64")}`;
const icon = (name) => `<svg width="26" height="26" viewBox="0 0 24 24">${collection.icons[name].body}</svg>`;
let tokens = fs.readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
tokens = tokens.replace(/url\("\/fonts\/([^"]+)"\)/g, (_, file) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(publicDir, "fonts", file)).toString("base64")}")`);
const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><style>${tokens}
*{box-sizing:border-box}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:var(--paper);font-family:var(--font-body);color:var(--text)}
.canvas{height:630px;padding:54px 58px;display:grid;grid-template-columns:620px 1fr;grid-template-rows:66px 1fr 56px;gap:18px 24px}
.brand{display:flex;align-items:center;gap:14px;font-family:var(--font-display);font-size:37px;font-weight:600;letter-spacing:-1.2px}
.brand-logo{width:190px;height:52.51px;object-fit:contain}
.status{font-size:13px;align-self:center;justify-self:end;color:var(--muted)}
h1{font-family:var(--font-display);font-size:74px;letter-spacing:-3px;font-weight:550;line-height:1.08;margin:44px 0 23px}
.subtitle{max-width:490px;font-size:20px;line-height:1.65;color:var(--muted);margin:0}
.diagram{grid-column:2;grid-row:2 / 4;position:relative;border:1px solid var(--line);border-radius:20px;background:var(--surface);padding:23px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.machine{display:flex;align-items:center;gap:8px;position:absolute;top:20px;left:23px;font-size:12px;color:var(--muted);font-weight:700}
.agent{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--muted);margin-top:33px}
.wire{width:1px;height:23px;background:var(--line-strong)}
.core{width:255px;padding:24px 12px;border-radius:14px;background:var(--brand-surface);border:1px solid var(--brand-border);box-shadow:var(--brand-shadow);color:var(--on-brand);text-align:center}
.core-brand{display:flex;gap:12px;align-items:center;justify-content:center;font-family:var(--font-display);font-size:34px;font-weight:550}
.core-brand img{width:165px;height:45.60px;object-fit:contain}
.core p{font-size:12px;margin:14px 0 0;color:var(--brand-muted)}
.destinations{display:grid;grid-template-columns:1fr 1fr;gap:11px;width:100%}
.destination{display:flex;gap:8px;align-items:center;justify-content:center;padding:13px 8px;border:1px solid var(--line);border-radius:10px;background:var(--surface);font-size:12px;font-weight:650}
.destination svg{color:var(--icon-color)}
.destination img{width:25px;height:25px}
.coach{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-top:22px}
.footer{grid-column:1;grid-row:3;align-self:end;display:flex;gap:23px;font-size:13px;color:var(--muted)}
.footer span{display:flex;align-items:center;gap:7px}
.footer svg{width:18px;height:18px}
</style></head><body><main class="canvas"><div class="brand"><img class="brand-logo" src="${image("roster-lockup-cobalt.svg")}" alt="Roster"></div><div class="status">${release.published ? `v${release.version}` : "Open source. Pre-release."}</div><div><h1>All your tools.<br>One local router.</h1><p class="subtitle">MCP tools. Approved skills. Local learning.<br>Your toolkit, under your control.</p></div><div class="diagram"><span class="machine">${icon("device-laptop")}On your machine</span><div class="agent">${icon("terminal-2")}Your MCP client</div><span class="wire"></span><div class="core"><div class="core-brand"><img src="${image("roster-lockup-pearl.svg")}" alt="Roster"></div><p>The local tool router</p></div><span class="wire"></span><div class="destinations"><div class="destination"><img src="${image("brands/playwright.svg")}" alt="">Tool servers</div><div class="destination">${icon("book-2")}Playbook</div></div><div class="coach">${icon("database")}The Coach keeps learning local</div></div><div class="footer"><span>${icon("cloud-off")}No Roster cloud</span><span>${icon("shield-check")}Your agent stays in control</span></div></main></body></html>`;
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(publicDir, "social.png") });
  const favicon = fs.readFileSync(path.join(publicDir, "favicon.svg"), "utf8");
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(`<style>body{margin:0}svg{width:180px;height:180px;display:block}</style>${favicon}`);
  await page.screenshot({ path: path.join(publicDir, "apple-touch-icon.png"), omitBackground: true });
  console.log("Rendered social.png (1200×630) and apple-touch-icon.png (180×180) from local assets.");
  const manifestPath = path.join(publicDir, "licenses/assets.json");
  const generated = ["social.png", "apple-touch-icon.png"];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")).filter(entry => !generated.includes(entry.asset));
  for (const asset of generated) manifest.push({
    asset,
    source: asset === "social.png" ? "scripts/render-assets.mjs and local identity assets" : "public/favicon.svg",
    sha256: createHash("sha256").update(fs.readFileSync(path.join(publicDir, asset))).digest("hex"),
    method: "Rendered from local vectors in isolated Chrome.",
    license: "Roster artwork; font and vendor licenses are recorded separately.",
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await browser.close();
}
