export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const fmt3 = (n: number): string => n.toFixed(3);
export const pct1 = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** Self-contained, theme-aware, zero external requests — GitHub-Pages- and file://-safe. */
const CSS = `
:root{
  color-scheme:dark light;
  --bg:#0a0d13; --panel:#111622; --panel2:#0d1119; --line:#1e2635;
  --ink:#e9eef8; --dim:#8b96ab; --accent:#ff6d3d; --gold:#ffb84d;
  --win:#3ddc97; --loss:#ff5d6c;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme: light){:root{
  --bg:#f6f7fa; --panel:#ffffff; --panel2:#eef1f6; --line:#e2e6ee;
  --ink:#141824; --dim:#5c6678; --accent:#e5501f; --gold:#b97a10;
  --win:#0c9d68; --loss:#d63447;
}}
:root[data-theme="dark"]{
  --bg:#0a0d13; --panel:#111622; --panel2:#0d1119; --line:#1e2635;
  --ink:#e9eef8; --dim:#8b96ab; --accent:#ff6d3d; --gold:#ffb84d;
  --win:#3ddc97; --loss:#ff5d6c;
}
:root[data-theme="light"]{
  --bg:#f6f7fa; --panel:#ffffff; --panel2:#eef1f6; --line:#e2e6ee;
  --ink:#141824; --dim:#5c6678; --accent:#e5501f; --gold:#b97a10;
  --win:#0c9d68; --loss:#d63447;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.55;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:0 auto;padding:40px 20px 64px}
a{color:inherit;text-decoration:none}
a:hover{color:var(--accent)}

.brandrow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wordmark{font-weight:800;letter-spacing:.42em;font-size:13px;color:var(--dim)}
.wordmark b{color:var(--accent)}
.season{font-family:var(--mono);font-size:12px;letter-spacing:.14em;color:var(--dim)}
.season b{color:var(--gold)}
h1.masthead{font-size:clamp(44px,9vw,84px);font-weight:800;letter-spacing:-.035em;
  line-height:1.02;margin:10px 0 6px;text-transform:uppercase}
h1.masthead .dot{color:var(--accent)}
.tag{color:var(--dim);font-size:17px;max-width:56ch}
.creed{display:flex;gap:10px;flex-wrap:wrap;list-style:none;margin-top:18px}
.creed li{font-family:var(--mono);font-size:12px;color:var(--dim);
  border:1px solid var(--line);border-radius:999px;padding:5px 12px;background:var(--panel2)}
.creed li::before{content:"▸ ";color:var(--accent)}

.division{margin-top:44px}
.divhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  border-bottom:3px solid var(--accent);padding-bottom:8px;margin-bottom:0}
.divhead h2{font-size:20px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.tierchip{font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--gold)}

.tablewrap{overflow-x:auto;border:1px solid var(--line);border-top:none;border-radius:0 0 10px 10px;background:var(--panel)}
table{border-collapse:collapse;width:100%;min-width:640px}
th{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--dim);text-align:left;padding:12px 14px;border-bottom:1px solid var(--line)}
td{padding:13px 14px;border-bottom:1px solid var(--line);font-size:14.5px;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--panel2)}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.rk{font-family:var(--mono);color:var(--dim);width:44px}
.teamcell a{font-weight:700}
.teamcell .cat{display:block;font-size:11.5px;color:var(--dim)}
.record{font-family:var(--mono);font-weight:700;letter-spacing:.04em}
.lbcell{min-width:150px}
.lbval{font-family:var(--mono);font-weight:700}
.lbval sup{color:var(--dim);font-size:9px;margin-left:2px}
.lbbar{height:4px;border-radius:2px;background:var(--line);margin-top:6px;overflow:hidden}
.lbbar i{display:block;height:100%;background:var(--accent)}
.chip{display:inline-block;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;
  border-radius:4px;padding:3px 8px;border:1px solid var(--line);color:var(--dim)}
.chip.pre{color:var(--accent);border-color:var(--accent)}
.chip.ranked{color:var(--gold);border-color:var(--gold)}
.chip.win{color:var(--win);border-color:var(--win);font-weight:700}
.chip.loss{color:var(--loss);border-color:var(--loss);font-weight:700}
.tablefoot{font-size:12.5px;color:var(--dim);padding:10px 2px}
.tablefoot code{font-family:var(--mono)}

.back{display:inline-block;font-family:var(--mono);font-size:13px;color:var(--dim);margin-bottom:22px}
.scorehead{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:26px 26px 22px}
.teamline{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.teamline h1{font-size:clamp(30px,6vw,48px);font-weight:800;letter-spacing:-.02em;text-transform:uppercase}
.suitechip{font-family:var(--mono);font-size:12px;color:var(--dim)}
.statrow{display:flex;gap:34px;flex-wrap:wrap;margin-top:18px}
.stat .v{font-family:var(--mono);font-size:34px;font-weight:800;letter-spacing:-.02em}
.stat .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;margin-top:2px}
.stat .sub{font-size:11.5px;color:var(--dim)}
.provenance{margin-top:14px;border:1px dashed var(--accent);border-radius:10px;padding:12px 16px;
  font-family:var(--mono);font-size:12.5px;color:var(--accent);background:var(--panel2)}
.taskname{font-family:var(--mono);font-size:13px}
.taskdesc{display:block;font-size:12px;color:var(--dim);font-family:var(--sans)}
.repro{margin-top:30px}
.repro h3{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
.repro pre{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;
  overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.6}
.meta{margin-top:44px;border-top:1px solid var(--line);padding-top:16px;
  font-size:12.5px;color:var(--dim)}
.meta code{font-family:var(--mono)}
.section-note{margin-top:26px;font-size:13px;color:var(--dim)}
.section-note a{color:var(--accent)}
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
