export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const fmt3 = (n: number): string => n.toFixed(3);

/**
 * Self-contained, theme-aware, zero external requests — the generated pages
 * must work from file:// and behind any CSP. Identity is carried by weight,
 * tracking, and tabular mono numerals rather than font files: a deliberate
 * trade so the generator ships no assets.
 */
const CSS = `
:root{
  color-scheme:dark light;
  --bg:#0b0d12; --surface:#12151c; --inset:#0e1117; --line:#202531;
  --ink:#edf0f7; --dim:#8e97a8; --faint:#5b6272;
  --accent:#ff6b3a; --gold:#f0b44c; --win:#34d399; --loss:#f87171;
  --glow:rgba(255,107,58,.05);
  --mono:ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme: light){:root{
  --bg:#f7f7f5; --surface:#ffffff; --inset:#f1f0ec; --line:#e5e4df;
  --ink:#16181d; --dim:#6a7180; --faint:#9aa0ad;
  --accent:#e04e12; --gold:#9a6b12; --win:#0e9f6e; --loss:#dc2f45;
  --glow:rgba(224,78,18,.05);
}}
:root[data-theme="dark"]{
  --bg:#0b0d12; --surface:#12151c; --inset:#0e1117; --line:#202531;
  --ink:#edf0f7; --dim:#8e97a8; --faint:#5b6272;
  --accent:#ff6b3a; --gold:#f0b44c; --win:#34d399; --loss:#f87171;
  --glow:rgba(255,107,58,.05);
}
:root[data-theme="light"]{
  --bg:#f7f7f5; --surface:#ffffff; --inset:#f1f0ec; --line:#e5e4df;
  --ink:#16181d; --dim:#6a7180; --faint:#9aa0ad;
  --accent:#e04e12; --gold:#9a6b12; --win:#0e9f6e; --loss:#dc2f45;
  --glow:rgba(224,78,18,.05);
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.6;
  -webkit-font-smoothing:antialiased;border-top:3px solid var(--accent)}
.wrap{max-width:860px;margin:0 auto;padding:52px 22px 72px;position:relative}
.wrap::before{content:"";position:absolute;inset:-52px 0 auto 0;height:340px;pointer-events:none;
  background:radial-gradient(560px 300px at 28% 0%,var(--glow),transparent 70%)}
a{color:inherit;text-decoration:none}
a:hover{color:var(--accent)}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}

/* ---- header ---- */
.brandrow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wordmark{font-family:var(--mono);font-weight:700;letter-spacing:.38em;font-size:12px;color:var(--dim)}
.wordmark b{color:var(--accent)}
.leaguetag{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--faint)}
h1.masthead{font-size:clamp(40px,7.5vw,68px);font-weight:900;letter-spacing:-.04em;
  line-height:1.02;margin:18px 0 10px;text-wrap:balance}
h1.masthead .dot{color:var(--accent)}
.tag{color:var(--dim);font-size:17px;max-width:52ch}
.seasonline{margin-top:16px;font-family:var(--mono);font-size:12.5px;color:var(--dim)}
.seasonline b{color:var(--accent);font-weight:700}

/* ---- how it works ---- */
.how{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:44px}
@media (max-width:640px){.how{grid-template-columns:1fr}}
.how li{list-style:none;background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:16px 18px}
.how .step{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;color:var(--accent);
  display:block;margin-bottom:6px}
.how b{display:block;font-size:14.5px;margin-bottom:2px}
.how p{font-size:13px;color:var(--dim);line-height:1.5}

/* ---- standings ---- */
.division{margin-top:56px}
.divhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;
  margin-bottom:14px}
.divhead h2{font-size:22px;font-weight:800;letter-spacing:-.01em;text-transform:capitalize}
.divhead h2 span{color:var(--faint);font-weight:600}
.tierchip{font-size:12.5px;color:var(--dim)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
table{border-collapse:collapse;width:100%;min-width:620px}
th{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--faint);text-align:left;padding:14px 16px 10px;border-bottom:1px solid var(--line)}
th.r,td.r{text-align:right}
td{padding:16px;border-bottom:1px solid var(--line);font-size:15px;vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr{animation:rise .45s calc(var(--i,0)*38ms) cubic-bezier(.2,.7,.2,1) backwards}
.rk{font-family:var(--mono);color:var(--faint);width:40px;font-size:14px}
td.rk.medal{color:var(--gold);font-weight:700}
.teamcell a{font-weight:700;font-size:16px}
.teamcell .sub{display:block;font-size:12px;color:var(--faint);margin-top:1px}
.scorecell{min-width:170px}
.scoreval{font-family:var(--mono);font-weight:700;font-size:21px;letter-spacing:-.01em}
.scoresub{display:block;font-size:11px;color:var(--faint);margin-top:1px}
.scorebar{height:3px;border-radius:2px;background:var(--line);margin-top:8px;overflow:hidden}
.scorebar i{display:block;height:100%;background:var(--accent);transform-origin:left;
  animation:grow .8s calc(.15s + var(--i,0)*38ms) cubic-bezier(.2,.7,.2,1) backwards}
.pair{font-family:var(--mono);font-weight:600;font-size:15px}
.pair .sub{display:block;font-family:var(--sans);font-size:11px;color:var(--faint);font-weight:400}
.badge{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.12em;
  border-radius:5px;padding:4px 9px;border:1px solid var(--line);color:var(--dim);white-space:nowrap}
.badge.pre{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.badge.gold{color:var(--gold);border-color:color-mix(in srgb,var(--gold) 45%,transparent)}
.tablefoot{font-size:13px;color:var(--dim);padding:12px 4px 0;max-width:70ch}

/* ---- box score ---- */
.back{display:inline-block;font-family:var(--mono);font-size:13px;color:var(--dim);margin-bottom:26px}
.scorehead{border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:30px}
.scorehead h1{font-size:clamp(30px,6vw,44px);font-weight:900;letter-spacing:-.03em;text-transform:capitalize}
.suiteline{color:var(--dim);font-size:14.5px;margin-top:4px;max-width:56ch}
.statrow{display:flex;gap:44px;flex-wrap:wrap;margin-top:26px}
.stat .v{font-family:var(--mono);font-size:36px;font-weight:700;letter-spacing:-.02em}
.stat .k{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:var(--faint);
  text-transform:uppercase;margin-top:4px}
.stat .sub{font-size:12px;color:var(--dim);margin-top:1px}
.note{margin-top:22px;border-left:3px solid var(--accent);background:var(--inset);
  border-radius:0 10px 10px 0;padding:12px 16px;font-size:13.5px;color:var(--dim)}
.note b{color:var(--accent);font-family:var(--mono);font-size:11px;letter-spacing:.12em}
.taskdesc{font-size:14.5px}
.taskid{display:block;font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:2px}
.taskfail{display:block;font-size:12px;color:var(--loss);margin-top:2px}
.chip{display:inline-block;font-family:var(--mono);font-size:11px;font-weight:700;
  border-radius:5px;padding:3px 9px}
.chip.win{color:var(--win);background:color-mix(in srgb,var(--win) 12%,transparent)}
.chip.loss{color:var(--loss);background:color-mix(in srgb,var(--loss) 12%,transparent)}
.section{margin-top:48px}
.section h3{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--faint);margin-bottom:12px}
.section pre{background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:15px 18px;overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.7}

/* ---- footer ---- */
.meta{margin-top:56px;border-top:1px solid var(--line);padding-top:18px;
  font-size:12.5px;color:var(--faint);line-height:1.8}
.meta code{font-family:var(--mono);color:var(--dim)}

@keyframes rise{from{opacity:0;transform:translateY(7px)}}
@keyframes grow{from{transform:scaleX(0)}}
@media (prefers-reduced-motion: reduce){
  tbody tr,.scorebar i{animation:none}
}
`;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${body}
</div>
</body>
</html>
`;
}
