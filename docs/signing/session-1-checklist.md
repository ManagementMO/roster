# Signing session #1 — filesystem suite (guided, ~15–20 min)

> **Why this must be you, not an agent.** The League's core promise is "only human-signed tasks feed named public scores" (methodology §4; laws in `ROSTER-STATE-AND-DECISIONS.md` §4.4). An agent flipping `signed: true` — especially the agent that built the harness — would make that claim false. Everything below is prepped so your part is pure verification: run two commands, eyeball two outcomes, flip the flags, log it.

**What's already done for you:** the suite passes 8/8 against the real server (artifact in `docs/verification/`); the fail probes below are pre-written; the swarm's Combine-integrity agent is additionally mutation-testing every verifier against sabotaged end states (results land in `docs/lab/notes-combine-adversarial.md` — glance at it if it has landed; any false-pass it found blocks signing for that task).

All commands from the repo root.

## Step 1 — Pass case (~2 min): all 8 tasks must PASS

```bash
node packages/cli/dist/bin.js combine run suites/filesystem/tasks.yaml \
  --name filesystem \
  --out docs/verification/$(date +%F)-filesystem-lab-results.json \
  -- npx -y @modelcontextprotocol/server-filesystem '{{sandbox}}'
```

Expected: `PASS` × 8, summary `filesystem: 8/8 passed`. Each task runs in a fresh sandbox against a fresh server process; `{{sandbox}}` is substituted per task.

## Step 2 — Fail probes (~2 min): all 8 probes must FAIL

Same invocations, sabotaged expectations — this proves each verifier can *catch* a wrong outcome, not just bless a right one:

```bash
node packages/cli/dist/bin.js combine run docs/signing/fail-probes.yaml \
  --name filesystem-failprobe \
  --out docs/signing/last-failprobe-results.json \
  -- npx -y @modelcontextprotocol/server-filesystem '{{sandbox}}'
```

Expected: `FAIL` × 8 (every failure at the `verify` stage), summary `0/8 passed`, exit code 1.

**If any probe PASSES: STOP.** That verifier cannot detect wrongness — do not sign its task; tell the agent which one.

## Step 3 — Confirm each check matches real semantics (~5 min)

One line each — you're confirming the verifier tests what the task claims:

| Task | You are certifying that… |
|---|---|
| `fs.write-file.v1` | exact bytes land on disk (fileEquals, not "no error") |
| `fs.read-text-file.v1` | the result carries the seeded file's exact content |
| `fs.create-directory.v1` | the directory really exists afterward |
| `fs.list-directory.v1` | the listing names the seeded file |
| `fs.move-file.v1` | source is gone AND destination has the exact bytes |
| `fs.get-file-info.v1` | the stat result reports a size field |
| `fs.search-files.v1` | a uniquely-named nested file is found via glob (server quirk documented in the task comment) |
| `fs.list-allowed.v1` | the server truthfully reports its sandbox root |

## Step 4 — Flip and log (~5 min)

1. In `suites/filesystem/tasks.yaml`, set `signed: true` on each task you certified — the field doesn't exist per-task yet because unsigned is the default; add `signed: true` under each task's `id:` line.
2. Rerun Step 1. The summary should now show `signed 8` and the artifact gains a real `signedWilsonLb` — the first number allowed to back a named public score.
3. Add your entry to `docs/PROVENANCE.md` (human-review table):

```markdown
| 2026-MM-DD | filesystem-core v0.1.0 (8 tasks) | Mo | Ran pass suite (8/8) + fail probes (0/8 pass, all caught at verify); confirmed each verifier matches real server semantics; flipped signed: true |
```

4. Commit `suites/filesystem/tasks.yaml` + the new artifact + PROVENANCE together (or tell the agent "signed, commit it" and it will).

That's it. The League gains its first human-certified division; the site's PRE-SEASON banner lifts automatically once a signed artifact exists.
