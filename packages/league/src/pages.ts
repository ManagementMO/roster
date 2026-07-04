import {
  isPreSeason,
  isRankable,
  METHODOLOGY_VERSION,
  MIN_RANKED_SIGNED_N,
  type LeagueRun,
  type LoadedArtifact,
} from "./artifact.js";
import { esc, fmt3, layout } from "./html.js";

export interface StandingsEntry {
  artifact: LoadedArtifact;
  run: LeagueRun;
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const boxScoreFilename = (run: LeagueRun): string => `box-${slug(run.server)}-${slug(run.suite)}.html`;

const record = (run: LeagueRun): string => `${run.summary.passes}–${run.summary.n - run.summary.passes}`;

/**
 * The number a row is judged by. Methodology: signedWilsonLb is the only
 * figure that may back a NAMED score; with zero signed tasks we display the
 * all-tasks Wilson LB labeled unofficial — it can order the pre-season table
 * but can never mint a rank.
 */
const displayLb = (run: LeagueRun): { value: number; unsigned: boolean } =>
  run.summary.signedN > 0
    ? { value: run.summary.signedWilsonLb, unsigned: false }
    : { value: run.summary.wilsonLb, unsigned: true };

const statusBadge = (run: LeagueRun): string => {
  if (isRankable(run)) return `<span class="badge gold">RANKED</span>`;
  if (isPreSeason(run)) return `<span class="badge pre">PRE-SEASON</span>`;
  return `<span class="badge">CERTIFYING · ${run.summary.signedN}/${MIN_RANKED_SIGNED_N}</span>`;
};

function standingsRow(entry: StandingsEntry, rank: number | null, index: number): string {
  const { run } = entry;
  const lb = displayLb(run);
  const s = run.summary;
  return `<tr style="--i:${index}">
<td class="rk${rank !== null && rank <= 3 ? " medal" : ""}">${rank === null ? "—" : String(rank)}</td>
<td class="teamcell"><a href="${esc(boxScoreFilename(run))}">${esc(run.server)}</a><span class="sub">${esc(run.suite)} v${esc(run.suiteVersion)}</span></td>
<td class="scorecell"><span class="scoreval">${fmt3(lb.value)}</span><span class="scoresub">${lb.unsigned ? "unofficial — no certified tasks yet" : "official — certified tasks only"}</span><span class="scorebar"><i style="width:${Math.round(lb.value * 100)}%"></i></span></td>
<td class="pair">${s.passes}/${s.n}<span class="sub">tasks passed</span></td>
<td class="pair">${s.signedN}/${s.n}<span class="sub">human-certified</span></td>
<td>${statusBadge(run)}</td>
</tr>`;
}

export function renderStandings(entries: StandingsEntry[]): string {
  const divisions = new Map<string, StandingsEntry[]>();
  for (const e of entries) {
    const list = divisions.get(e.run.category) ?? [];
    list.push(e);
    divisions.set(e.run.category, list);
  }

  const sections = [...divisions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, rows]) => {
      // Ranked rows first (by certified score); the rest ordered by the
      // unofficial score for readability, forever rank-less until certified.
      const ranked = rows
        .filter((r) => isRankable(r.run))
        .sort((a, b) => b.run.summary.signedWilsonLb - a.run.summary.signedWilsonLb);
      const rest = rows
        .filter((r) => !isRankable(r.run))
        .sort((a, b) => b.run.summary.wilsonLb - a.run.summary.wilsonLb);
      const body = [
        ...ranked.map((r, i) => standingsRow(r, i + 1, i)),
        ...rest.map((r, i) => standingsRow(r, null, ranked.length + i)),
      ].join("\n");
      return `<section class="division">
<div class="divhead"><h2>${esc(category)} <span>division</span></h2><span class="tierchip">Lab tier — identical suites, sandboxed runs</span></div>
<div class="tablewrap">
<table>
<thead><tr><th>RK</th><th>Server</th><th>Score</th><th>Tasks</th><th>Certified</th><th>Status</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
</div>
<p class="tablefoot">Score is the Wilson 95% lower bound — small samples score humbly by construction. A rank requires ${MIN_RANKED_SIGNED_N}+ human-certified tasks; until then results are shown, never ranked.</p>
</section>`;
    })
    .join("\n");

  const body = `<header>
<div class="brandrow"><span class="wordmark">R<b>O</b>STER</span><span class="leaguetag">the mcp server leaderboard</span></div>
<h1 class="masthead">The League<span class="dot">.</span></h1>
<p class="tag">Real tasks, verified outcomes, humble statistics. Every number on this page traces to a reproducible run.</p>
<p class="seasonline"><b>SEASON 0</b> · Pre-season — standings unlock at the first human-certified task.</p>
</header>
<ul class="how">
<li><span class="step">01 · RUN</span><b>Same tasks, every server</b><p>Each server faces its division's identical task suite in a clean sandbox.</p></li>
<li><span class="step">02 · VERIFY</span><b>End state, not vibes</b><p>Outcomes are checked against what actually happened on disk. No LLM judges.</p></li>
<li><span class="step">03 · CERTIFY</span><b>Humans sign the tests</b><p>A person certifies every task before it can rank a name. Unsigned results never do.</p></li>
</ul>
${sections || `<p class="tablefoot">No run artifacts yet — standings publish themselves from <code>lab-results.json</code> files.</p>`}
<footer class="meta">Every number traces to a run artifact in <code>docs/verification/</code> · methodology ${esc(METHODOLOGY_VERSION)} · static site, zero backend — fork and rerun.</footer>`;

  return layout("ROSTER · The League — MCP server leaderboard", body);
}

export function renderBoxScore(entry: StandingsEntry, taskDescriptions: ReadonlyMap<string, string>): string {
  const { run, artifact } = entry;
  const lb = displayLb(run);
  const s = run.summary;
  const rows = run.results
    .map((r, i) => {
      const desc = taskDescriptions.get(r.taskId);
      return `<tr style="--i:${i}">
<td class="rk num">${i + 1}</td>
<td class="taskdesc">${desc ? esc(desc) : esc(r.taskId)}<span class="taskid">${esc(r.taskId)}</span>${r.detail ? `<span class="taskfail">${esc(r.stage ?? "")}: ${esc(r.detail)}</span>` : ""}</td>
<td><span class="chip ${r.pass ? "win" : "loss"}">${r.pass ? "W" : "L"}</span></td>
<td class="r num">${r.latencyMs} ms</td>
</tr>`;
    })
    .join("\n");

  const body = `<a class="back" href="index.html">← Standings</a>
<header class="scorehead">
<h1>${esc(run.server)}</h1>
<p class="suiteline">Tested against <b>${esc(run.suite)} v${esc(run.suiteVersion)}</b> · ${esc(run.category)} division · Lab tier — sandboxed, end-state-verified tasks.</p>
<div class="statrow">
<div class="stat"><div class="v">${record(run)}</div><div class="k">Record</div><div class="sub">${s.passes} of ${s.n} tasks passed</div></div>
<div class="stat"><div class="v">${fmt3(lb.value)}</div><div class="k">Score</div><div class="sub">Wilson LB · ${lb.unsigned ? "unofficial (uncertified)" : "certified tasks only"}</div></div>
<div class="stat"><div class="v">${s.signedN}/${s.n}</div><div class="k">Certified</div><div class="sub">${MIN_RANKED_SIGNED_N}+ needed to rank</div></div>
</div>
${isPreSeason(run) ? `<div class="note"><b>UNSIGNED RUN · PRE-SEASON</b><br>These results are real and reproducible, but may not back a named ranking until a human certifies each task (methodology §4).</div>` : ""}
</header>
<section class="section">
<h3>Box score — end-state verified, no LLM judge</h3>
<div class="tablewrap">
<table>
<thead><tr><th>#</th><th>Task</th><th>Result</th><th class="r">Latency</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
</section>
<section class="section">
<h3>Reproduce this run</h3>
<pre>roster combine run suites/${esc(run.category)}/tasks.yaml --name ${esc(run.server)} \\
  -- &lt;server command&gt;   # {{sandbox}} in args is replaced per task</pre>
</section>
<footer class="meta">Run ${esc(artifact.data.generatedAt)} · node ${esc(artifact.data.environment.node)} · ${esc(artifact.data.environment.platform)}/${esc(artifact.data.environment.arch)} · environment digest <code title="${esc(artifact.data.environmentDigest)}">${esc(artifact.data.environmentDigest.slice(0, 12))}…</code> · methodology ${esc(METHODOLOGY_VERSION)} · artifact <code>${esc(artifact.path)}</code></footer>`;

  return layout(`${run.server} — box score · The League`, body);
}
