# ROSTER Round 6 — promise-fulfillment and launch-trust review

## Header

- **HEAD reviewed:** <code>f50e873d92e062e976ffeab8173ca3d2ffefc078</code>, which was the tip of <code>main</code>; this report was authored afterward on <code>codex/code-review-status</code>.
- **Date:** 2026-07-22 (America/Toronto).
- **Environment:** macOS 26.5.1 build 25F80 / Darwin 25.5.0 arm64; Node <code>v26.3.0</code>; pnpm <code>11.9.0</code>.
- **Review question:** does the current repository fulfill the promises made in [README.md](../../README.md), especially the trust-boundary claims around faithful proxying, exact eject, outcome learning, League provenance, Combine isolation, Playbook trust, privacy, and day-one utilities?
- **Method:** repository-wide static review, promise-to-code tracing, full build/test/static checks, real-server E2E, focused package checks, dependency audit, and isolated adversarial runtime reproductions.
- **Mutation policy:** report-only. No product code, tests, fixtures, dependencies, or generated verification artifacts were retained.
- **Network boundary:** no web research was used. The package-manager audit queried its configured advisory source. No package, release, site, or telemetry payload was published.
- **Worktree result:** the review began clean; all temporary verification artifacts were removed, and this report is the only retained change.

## Executive summary

**Launch status: BLOCKED.**

Roster has a convincing pre-release core. The ordinary stdio happy path works, the monorepo builds cleanly, all 191 committed tests pass, the real filesystem/memory E2E passes in transparent and five mode, local outcome rows omit raw arguments and results, telemetry is inert and off by default, Wilson lower-bound math is sound, and several earlier Round 5 defects have genuinely been repaired.

The current tree nevertheless does **not** fulfill several of its strongest README promises:

1. A backend tool can complete successfully and then be reported to the client as failed because local outcome logging threw. Retrying can duplicate a destructive side effect.
2. Exact eject fails for one client with multiple active config paths and under deterministic sync/eject interleavings. Eject can report success while a config remains rosterized and its pristine backup has been removed from the active automatic restore path.
3. League certification trusts handwritten result booleans. Once an authoritative suite contains at least 30 signed tasks, a fabricated artifact can mint a named ranked score without running Combine, a trusted CI job, or a signed result envelope.
4. Combine starts the target command directly on the host. Its “sandbox” is only a temporary path substituted by convention, not a process, filesystem, or network isolation boundary; the child inherits the caller's cwd.
5. Sync can remove a working remote or config-rich server even though Roster cannot preserve or serve its transport contract.
6. Required task-based MCP tools are advertised through Roster but cannot be invoked through it.
7. Coach reliability ratings do not normally influence a full lexical/dense draft; they are used only to fill empty slots.
8. Drift is stored but not surfaced as an alarm, quarantine can be bypassed through a forced five-mode call, and equivalent schema key reordering can cause false quarantine.
9. Playbook trust scanning misses executable extensionless scripts.
10. The repository's own moderate-or-higher dependency audit currently fails with three high and two moderate advisories.

The README correctly discloses that Roster is pre-release, unpublished, and unhosted. Those future-facing facts are not findings. The problem is narrower and more serious: several claims stated as properties of the code that already exists are stronger than the code's behavior at failure, concurrency, protocol, and provenance boundaries.

## Overall assessment

| Dimension | Status | Reason |
|---|---|---|
| Router ordinary stdio path | **PASS with limits** | Namespaced list/call works for ordinary tools; common results and most error codes survive. |
| Faithful MCP passthrough | **BLOCKED** | Recorder failures change call truth; required tasks, request metadata, progress/cancellation, icons, and vendor metadata are not faithfully proxied. |
| Five-mode draft/call | **PARTIAL** | The two-tool surface and K clamp work; outcome ratings rarely affect ranking and the real K+1 bench is not retained. |
| Coach learning | **BLOCKED** | Outcomes are stored safely, but ratings normally do not affect filled search results; “nightly” maintenance is boot-only and public Lab priors do not exist. |
| Drift protection | **BLOCKED** | Detection/quarantine exists, but there is no alarm, forced calls bypass quarantine, and canonical-equivalent schemas false-positive. |
| CLI import/sync | **BLOCKED** | Four write clients and one existing candidate path per client per invocation; remote/config-rich entries can be removed without a faithful replacement. |
| Exact eject | **BLOCKED** | Single-path uncontended restoration works; multi-path and lifecycle races violate the headline promise. |
| Playbook | **PARTIAL** | Skill parsing, five-mode bridge, and a trust gate exist; extensionless executables bypass scanning, transparent bridging and per-agent allowlists are absent. |
| Combine | **BLOCKED** | Process-per-task and timeouts work; there is no host isolation and verifier filesystem handling is bypassable. |
| League | **BLOCKED** | Math and basic schema checks work; artifact provenance, suite identity, category comparability, unsigned anonymity, and reproducibility do not. |
| Secrets/privacy | **PARTIAL** | Roster config/backup files and protected directories use restrictive POSIX modes, and raw call content is not persisted; malformed credential-bearing TOML can be echoed to stderr. |
| Telemetry | **PASS for current scope** | Default off; no uploader or endpoint exists. |
| CI/dependency posture | **BLOCKED** | Test/build/static gates pass locally, but the committed dependency-audit gate fails. |
| Documentation truthfulness | **BLOCKED** | README has useful pre-release disclosures, while README/STATUS still overstate exact eject, fidelity, learning, containment, ranking provenance, and CI green status. |

## Severity model

| Severity | Meaning in this review |
|---|---|
| **CRITICAL** | Can duplicate a completed side effect, silently strand or restore the wrong client configuration, fabricate the public product's named score, or execute an untrusted target outside the represented isolation boundary. |
| **HIGH** | Breaks a headline promise, removes a working integration, bypasses a security/trust boundary, leaks promised-secret material, or blocks the repository's own release gate. |
| **MEDIUM** | Produces materially wrong product behavior or evidence under realistic conditions, but with a narrower blast radius or an available manual workaround. |
| **LOW** | Robustness, durability, or documentation-quality issue that should be scheduled but need not independently stop a private preview. |

“Critical” here is a release/trust classification against the promised public workflow. Roster is currently private and unhosted: artifact forgery requires control of trusted repository inputs, and Combine executes an operator-supplied command. The critical impact appears when those same boundaries are used for unattended ingestion, third-party targets, or public scores without the missing controls.

## Findings

### R6-01 | CRITICAL | CONFIRMED | A successful side-effecting call can be converted into a client-visible failure by the recorder

**Promise affected.** README “faithful passthrough” and local outcome logging ([README.md § What it is](../../README.md#what-it-is)).

**Code path.**

- Transparent mode awaits the backend call, then synchronously records, then returns the result: [packages/router/src/rosterServer.ts#L190-L197](../../packages/router/src/rosterServer.ts#L190-L197).
- Five mode has the same ordering: [packages/router/src/rosterServer.ts#L303-L313](../../packages/router/src/rosterServer.ts#L303-L313).
- <code>record()</code> has no failure boundary around hashing or SQLite work: [packages/router/src/rosterServer.ts#L371-L390](../../packages/router/src/rosterServer.ts#L371-L390).
- <code>recordOutcome()</code> synchronously inserts and performs follow-up writes: [packages/coach/src/store.ts#L440-L465](../../packages/coach/src/store.ts#L440-L465).

**Adversarial reproduction.** A fixture backend returned the text <code>BACKEND SUCCEEDED</code>. The Coach database was then made unavailable before the recorder write. The client received:

~~~text
MCP error -32603: The database connection is not open
~~~

The backend side effect had already happened.

**Impact.** An agent can retry a payment, issue creation, deletion, send, or other non-idempotent operation because Roster falsely represented a completed call as failed. This is a truth-boundary and duplicate-execution defect, not merely an observability outage.

**Required correction.**

- Make recorder failure non-authoritative to the tool result.
- Catch and report local recording failures on a separate diagnostic channel.
- Prefer a bounded in-memory/outbox path if durable logging is required.
- Never automatically retry the backend as part of recorder recovery.

**Regression gate.** Run successful read-only and destructive-hint tools with a closed, locked, full, corrupt, and read-only Coach database. Assert that the direct result/code is unchanged and the backend invocation count remains exactly one.

### R6-02 | CRITICAL | CONFIRMED | One client with multiple config paths can remain rosterized after eject reports success

**Promise affected.** “<code>roster eject</code> puts every client back exactly as Roster found it” ([README.md § opening promise](../../README.md#roster)).

**Code path.**

- Cursor and Claude Code have cwd-dependent candidate paths: [packages/cli/src/clients.ts#L106-L109](../../packages/cli/src/clients.ts#L106-L109), [packages/cli/src/clients.ts#L134-L136](../../packages/cli/src/clients.ts#L134-L136).
- Sync chooses only the first path that exists in the current process: [packages/cli/src/sync.ts#L55-L59](../../packages/cli/src/sync.ts#L55-L59).
- Backups are keyed by client and timestamp, not canonical source path: [packages/cli/src/rosterfile.ts#L182-L184](../../packages/cli/src/rosterfile.ts#L182-L184).
- Eject selects one pristine backup and one target path: [packages/cli/src/eject.ts#L29-L51](../../packages/cli/src/eject.ts#L29-L51).
- A successful eject archives the entire client's backup directory: [packages/cli/src/eject.ts#L207-L215](../../packages/cli/src/eject.ts#L207-L215).

**Adversarial reproduction.**

1. With no home Cursor config, sync project A's <code>.cursor/mcp.json</code>.
2. Change cwd and sync project B's <code>.cursor/mcp.json</code>.
3. Eject Cursor.

Observed:

~~~json
{
  "syncA": "synced",
  "syncB": "synced",
  "eject": "restored",
  "aRestored": true,
  "bRestored": false,
  "bStillRoster": true,
  "secondEject": "no-backup",
  "activeBackupDirExists": false
}
~~~

**Impact.** Project B remains dependent on Roster, and its pre-Roster configuration is no longer automatically restorable; manually locating the archived backup is required. The CLI reports a clean restore even though the headline invariant is false.

**Required correction.** Key eras by <code>(client, canonical sourcePath)</code>. A client-wide eject must enumerate and restore every active path group before closing any group. Archive only the groups whose targets were conclusively restored.

**Regression gate.** Cover two distinct cases: both state/dedicated candidates existing simultaneously, with the chosen scope explicitly reported; and separate throwaway cwd runs with the home candidate absent, creating backups for two project paths. Across two sync/eject cycles, verify every target byte/key result and every backup group's automatic discoverability.

### R6-03 | CRITICAL | CONFIRMED | Sync/eject lifecycle races and crash windows can close the wrong era

**Promise affected.** No-risk eject and the comments claiming crash-safe backup lifecycle.

**Code path.**

- State-file and dedicated-file eject both publish restored target bytes before era closure: [packages/cli/src/eject.ts#L79-L90](../../packages/cli/src/eject.ts#L79-L90), [packages/cli/src/eject.ts#L120-L138](../../packages/cli/src/eject.ts#L120-L138).
- Sync has no per-client lifecycle lock around backup creation and target replacement: [packages/cli/src/sync.ts#L55-L116](../../packages/cli/src/sync.ts#L55-L116).
- <code>closeEra()</code> closes through the newest backup visible when it eventually runs: [packages/cli/src/sync.ts#L239-L245](../../packages/cli/src/sync.ts#L239-L245).

**Adversarial reproduction.** A deterministic interleaving ran a new sync after eject's target rename but before <code>closeEra()</code>. The nested sync created a new backup and rosterized the file; the outer eject then archived both eras and returned success.

~~~json
{
  "ejectAction": "restored",
  "finalIsOriginal": false,
  "finalStillRoster": true,
  "secondEject": "no-backup",
  "activeBackupDirExists": false
}
~~~

Injecting failure immediately after target publication—producing the same persisted state as process death at that boundary—allowed a later eject to restore stale era-zero bytes over the intended era-one state.

**Impact.** Roster-vs-Roster concurrency or a crash at a narrow but real point can permanently destroy the correct automatic restore path.

**Required correction.**

- Add a per-client interprocess lock covering sync and eject.
- Journal the intended era and target before publishing the target.
- Recover/finish an interrupted restore before permitting a new sync.
- Close only the exact era selected at transaction start.

**Regression gate.** Use controlled child-process barriers at both state and dedicated target renames, marker publication, and archive rename. Kill the child at every boundary and prove that the intended era—not an older era—is the next automatic restore candidate, or that the next invocation safely refuses.

### R6-04 | CRITICAL | CONFIRMED | A handwritten League artifact can mint a named rank once an authoritative signed suite exists

**Promise affected.** Public rankings from identical human-signed suites and no named score from an unsigned verifier ([README.md § League](../../README.md#what-it-is), [README.md § provenance](../../README.md#built-with-agents-reviewed-by-hand)).

**Code path.**

- The parser validates row shape but trusts each row's claimed <code>pass</code>: [apps/league/src/artifact.ts#L76-L104](../../apps/league/src/artifact.ts#L76-L104).
- Certification checks task IDs and copied <code>signed</code> flags, not execution provenance: [apps/league/src/artifact.ts#L137-L161](../../apps/league/src/artifact.ts#L137-L161).
- <code>environmentDigest</code> is only required to be a string: [apps/league/src/artifact.ts#L60-L61](../../apps/league/src/artifact.ts#L60-L61).
- Accepted artifacts are rendered by the site builder: [apps/league/src/build.ts#L89-L110](../../apps/league/src/build.ts#L89-L110).
- CI writes the fresh Combine result only to <code>$RUNNER_TEMP</code>, while <code>league:build</code> separately reads committed <code>docs/verification</code> artifacts; no compare, promotion, or trusted-run handoff connects them: [.github/workflows/ci.yml#L82-L113](../../.github/workflows/ci.yml#L82-L113), [apps/league/src/build.ts#L121-L125](../../apps/league/src/build.ts#L121-L125).

**Adversarial reproduction.** The reproduction created an authoritative synthetic suite containing 30 <code>signed:true</code> task definitions, then supplied a completely handwritten 30/30 result artifact with <code>"environmentDigest":"not-a-digest"</code>. It became a named <code>RANKED</code> entry. No Combine command, trusted workflow, artifact signature, result digest, or server-identity proof was needed. Current HEAD has only eight unsigned filesystem tasks, so an artifact writer alone cannot create a ranked row today.

**Impact.** Once a publishable signed suite exists, anyone able to alter trusted artifact inputs can fabricate its named evidence. This is not a remote injection path in the current private, unhosted tree; it is a missing authenticity boundary in the planned publication pipeline. Re-deriving a summary from attacker-authored booleans does not establish that the tasks ran.

**Required correction.**

- Accept publication artifacts only from an authenticated trusted-CI channel.
- Sign or attest the complete artifact after execution.
- Bind server identity/version, target command or immutable package digest, suite digest, task definitions, result rows, runner version, and environment image into the attestation.
- Reject human-authored result rows even when their arithmetic is internally consistent.

**Regression gate.** Handwrite, edit, replay, and cross-server-copy artifacts against an otherwise authoritative signed suite. Every case must fail certification before rendering. Category and comparison-key mutation belong to R6-21.

### R6-05 | CRITICAL | CONFIRMED | Combine's represented sandbox does not isolate the target process

**Promise affected.** Methodology's Docker/per-server evidence-tier isolation boundary and the trust implied by publishing open probe results ([docs/methodology.md § evidence tiers](../methodology.md#3-evidence-tiers)).

**Code path.**

- <code>containedPath()</code> constrains runner-side path construction only: [packages/combine/src/runner.ts#L50-L57](../../packages/combine/src/runner.ts#L50-L57).
- The arbitrary target command is spawned directly on the host: [packages/combine/src/runner.ts#L109-L131](../../packages/combine/src/runner.ts#L109-L131).
- No <code>cwd</code> is passed to the transport, so the child inherits the caller/repository cwd; <code>{{sandbox}}</code> is only a temporary path substituted into arguments by convention.
- <code>task.mode</code> is parsed but otherwise unused: [packages/combine/src/task.ts#L93-L96](../../packages/combine/src/task.ts#L93-L96). The readonly-live frequency limit, identifiable User-Agent, opt-out, and write prohibition are therefore not enforced by the runner either.
- Task results/artifacts do not retain mode, while League copy hardcodes every division/run as sandboxed: [packages/combine/src/runner.ts#L69-L84](../../packages/combine/src/runner.ts#L69-L84), [packages/combine/src/results.ts#L23-L29](../../packages/combine/src/results.ts#L23-L29), [apps/league/src/pages.ts#L76-L77](../../apps/league/src/pages.ts#L76-L77), [apps/league/src/pages.ts#L131-L140](../../apps/league/src/pages.ts#L131-L140).

**Impact.** An operator-supplied hostile write-capable server can read or alter host files available to the current user, access the network, inspect environment variables, or interfere with the repository and subsequent tasks. A temporary path convention is not a security sandbox. This becomes critical for official unattended runs against third-party targets; a developer intentionally invoking a local command already grants that command ordinary local authority.

**Required correction.**

- Run every target in a disposable container/VM or an OS-enforced sandbox.
- Mount only a task-specific workspace.
- Default-deny host filesystem and network access, adding explicit task capabilities.
- Use a pinned image and record its immutable digest.
- Kill the complete process group/container on timeout.

**Regression gate.** Test attempted reads/writes outside the workspace, network egress, parent-process signaling, environment enumeration, symlink escape, and child-process survival after timeout.

### R6-06 | HIGH | CONFIRMED | Unsigned League evidence is rendered into named public-intended pages

**Promise affected.** README's no-named-unsigned-score rule ([README.md § provenance](../../README.md#built-with-agents-reviewed-by-hand)) and methodology's unsigned-only internal/anonymized rule ([docs/methodology.md § provenance](../methodology.md#4-provenance-signed-vs-unsigned)).

**Code path.**

- When <code>signedN === 0</code>, standings select the all-task Wilson lower bound: [apps/league/src/pages.ts#L28-L31](../../apps/league/src/pages.ts#L28-L31).
- The page renders server name, all-task pass record/N, and score together even when a run is partially signed: [apps/league/src/pages.ts#L45-L48](../../apps/league/src/pages.ts#L45-L48).
- Box scores repeat named unsigned outcomes: [apps/league/src/pages.ts#L119-L140](../../apps/league/src/pages.ts#L119-L140).

**Impact.** “Unofficial” is a label, not anonymization. Nothing is hosted today, but the current generator produces the named public-intended pages that would violate the publication law. Partially signed runs also expose their unsigned record/outcomes beside the named server.

**Required correction.** Exclude unsigned evidence from every named score, pass record, and box score. Keep it private/internal or publish only thresholded anonymous aggregates; zero-signed runs must never render a server identity or score.

### R6-07 | HIGH | CONFIRMED | Sync replaces working remote/config-rich servers with definitions Roster cannot run

**Promise affected.** Import every server, faithful passthrough, any MCP client, and one roster synced everywhere.

**Code path.**

- Import retains only command, args, env, and one URL field: [packages/cli/src/clients.ts#L54-L80](../../packages/cli/src/clients.ts#L54-L80).
- The central server model has no fields for headers/auth, cwd, transport-specific options, enabled state, timeouts, or tool filters: [packages/cli/src/rosterfile.ts#L60-L67](../../packages/cli/src/rosterfile.ts#L60-L67).
- Serve explicitly skips URL-only entries: [packages/cli/src/serve.ts#L26-L30](../../packages/cli/src/serve.ts#L26-L30).
- Sync still replaces the client's full server map with Roster: [packages/cli/src/sync.ts#L121-L138](../../packages/cli/src/sync.ts#L121-L138).

**Adversarial reproduction.** A working Cursor remote URL with an Authorization header was imported, the header was discarded, sync removed the direct entry, and serve logged that URL backends are skipped. Roster served zero tools from it.

**Impact.** A nominally successful sync can turn a working configuration into an unavailable toolset while retaining no faithful runnable definition.

**Required correction.** Refuse mutation when an entry's transport or required fields are not losslessly representable by the supported router model; optionally perform a separate explicit, bounded connection preflight. Preserve unsupported entries directly and add transport-specific round-trip tests before claiming universal import.

### R6-08 | HIGH | CONFIRMED | Structural proxy detection silently drops legitimate servers

**Promise affected.** “Import every server” and safe synchronization.

**Code path.**

- <code>isRosterProxyEntry()</code> treats any <code>npx ... serve</code> form as Roster: [packages/cli/src/entry.ts#L99-L106](../../packages/cli/src/entry.ts#L99-L106).
- Imported entries matching that shape are silently skipped: [packages/cli/src/rosterfile.ts#L151-L158](../../packages/cli/src/rosterfile.ts#L151-L158).
- Sync then replaces the client's server map: [packages/cli/src/sync.ts#L121-L138](../../packages/cli/src/sync.ts#L121-L138).

**Adversarial reproduction.** A legitimate <code>{"command":"npx","args":["-y","acme-mcp","serve"]}</code> server disappeared from the active client config and was not present in <code>roster.json</code>. It survived only in the backup until eject.

**Impact.** A broad self-identity heuristic turns an ordinary third-party server into an unreachable false self-match.

**Required correction.** Skip only an entry exactly matching the current trusted <code>rosterEntry()</code> or a versioned signature previously recorded by this installation. Never infer ownership from the generic word <code>serve</code>.

### R6-09 | HIGH | CONFIRMED | Required task-based MCP tools are listed but cannot be invoked

**Promise affected.** Faithful passthrough, every backend tool, any MCP client, and the July 28 spec alignment.

**Code path.**

- Backend discovery preserves <code>execution.taskSupport</code>: [packages/router/src/backends.ts#L143-L147](../../packages/router/src/backends.ts#L143-L147).
- Roster advertises only <code>tools</code>, not task capabilities: [packages/router/src/rosterServer.ts#L117-L120](../../packages/router/src/rosterServer.ts#L117-L120).
- Request handling forwards only name and arguments: [packages/router/src/rosterServer.ts#L124-L137](../../packages/router/src/rosterServer.ts#L124-L137).
- Backend invocation always uses ordinary <code>client.callTool()</code>: [packages/router/src/backends.ts#L183-L187](../../packages/router/src/backends.ts#L183-L187).

**Adversarial reproduction.** A backend tool declared <code>taskSupport:"required"</code>. It appeared in Roster's list with that requirement, but calling it returned protocol error <code>-32600</code>; the backend invocation counter remained zero.

**Impact.** Roster advertises an impossible contract. Clients make the correct decision from the proxied definition and are then rejected by the proxy.

**Required correction.** Implement task augmentation, task capability negotiation, progress/cancellation propagation, request <code>_meta</code>, and result/task identity forwarding; otherwise omit/reject required-task tools with an explicit incompatibility rather than listing them as usable.

### R6-10 | HIGH | CONFIRMED | Coach reliability scores normally do not affect routing

**Promise affected.** “It learns from call outcomes” and “refines routing toward the tools that actually work.”

**Code path.**

- Normal lexical/dense fusion sorts and immediately returns if it has K candidates: [packages/coach/src/store.ts#L678-L700](../../packages/coach/src/store.ts#L678-L700).
- Wilson ratings are consulted only by the underfilled fallback: [packages/coach/src/store.ts#L703-L720](../../packages/coach/src/store.ts#L703-L720).
- No production code seeds public Lab ratings.

**Adversarial reproduction.**

- Logged 100 failures for <code>bad__send</code>.
- Logged 100 successes for <code>good__send</code>.
- Wilson lower bounds were 0 and 0.963 respectively.
- A lexically matching <code>draft(..., 1)</code> still selected <code>bad__send</code>.

**Impact.** Wilson reliability is not a ranking signal in the common case where lexical/dense search fills K. OATS can still influence dense ranking after sufficient positive outcome evidence, so outcome learning is not wholly absent. The reproduction demonstrates that a strong Wilson difference does not participate; it does not prove that reliability should always reverse a lexically stronger result.

**Required correction.** Define and validate an explicit reliability/search fusion policy. Apply it to every candidate set, not only empty slots, with cold-start priors and minimum relevance floors. Add public-Lab seed provenance separately.

**Regression gate.** Hold relevance constant, vary reliability across statistically meaningful outcome histories, and assert monotonic ranking changes without allowing an irrelevant high-rated tool to win.

### R6-11 | HIGH | CONFIRMED | Drift alarms are silent and quarantine is bypassable

**Promise affected.** Local heads-up before schema changes break a workflow and explicit <code>roster unquarantine</code>.

**Code path.**

- <code>upsertCapabilities()</code> returns changed IDs and drift count: [packages/coach/src/store.ts#L164-L165](../../packages/coach/src/store.ts#L164-L165).
- <code>syncCapabilities()</code> discards that result: [packages/router/src/rosterServer.ts#L148-L160](../../packages/router/src/rosterServer.ts#L148-L160).
- <code>driftEvents()</code> has no production caller: [packages/coach/src/store.ts#L430-L435](../../packages/coach/src/store.ts#L430-L435).
- Five-mode <code>call</code> checks only <code>manager.lookup()</code>, not Coach active/quarantine state: [packages/router/src/rosterServer.ts#L301-L303](../../packages/router/src/rosterServer.ts#L301-L303).
- Stable re-sight automatically clears quarantine after the dwell: [packages/coach/src/store.ts#L260-L275](../../packages/coach/src/store.ts#L260-L275).

**Adversarial reproduction.** A drifted tool disappeared from draft, while <code>call({tool:"alpha__echo"})</code> still executed it and returned <code>EXECUTED</code>.

**Impact.** Current behavior is silent disappearance from default selection, continued execution through cached/forced calls, then documented automatic readmission—not a local heads-up. Methodology and STATUS describe quarantine primarily as default-roster exclusion and disclose the 24-hour clear, so call-time blocking is a product-policy decision rather than an already-set invariant.

**Required correction.** Surface drift during serve/init/receipt and in the planned dashboard. Explicitly decide and document whether quarantine is selection-only or call-time access control; if call-time protection is intended, require a reviewed override. Reconcile the auto-clear behavior with the separately advertised manual unquarantine command.

### R6-12 | HIGH | CONFIRMED | Playbook trust scanning misses executable extensionless scripts

**Promise affected.** A trust scan before any skill is listed.

**Code path.**

- Bundled-script discovery is extension-only: [packages/playbook/src/skill.ts#L22-L25](../../packages/playbook/src/skill.ts#L22-L25).
- Static scanning examines only that discovered script list: [packages/playbook/src/scan.ts#L110-L129](../../packages/playbook/src/scan.ts#L110-L129), [packages/playbook/src/trust.ts#L117-L132](../../packages/playbook/src/trust.ts#L117-L132).
- Router serves every skill whose incomplete scan returns <code>ok</code>: [packages/router/src/rosterServer.ts#L108-L115](../../packages/router/src/rosterServer.ts#L108-L115).

**Adversarial reproduction.** An executable <code>scripts/install</code> file containing <code>curl ... | bash</code> appeared in the skill's resources. The parsed <code>scripts</code> list was empty, trust status was <code>ok</code>, and the skill was served by default.

**Impact.** A common Unix installer convention bypasses the advertised boundary. The heuristic scan is documented as v0/advisory, but Router uses its <code>ok</code> result as an automatic serve gate. The defect is the incomplete executable inventory feeding that gate, not an expectation that a heuristic scanner detect all malicious behavior. PowerShell, batch, command files, hidden scripts, shebang executables, and unsupported extensions have similar gaps.

**Required correction.** Enumerate all regular files under executable/script directories with bounded traversal; inspect shebangs and executable bits; include platform script extensions; explicitly report unreadable or skipped executable candidates as review-required.

### R6-13 | HIGH | CONFIRMED | Malformed credential-bearing TOML can be printed verbatim

**Promise affected.** Secrets are never logged and content does not appear above debug.

**Code path.**

- The initial import parse is caught and treated as empty: [packages/cli/src/sync.ts#L69-L72](../../packages/cli/src/sync.ts#L69-L72).
- <code>rewriteConfig()</code> immediately reparses TOML outside that catch, so the second parser exception propagates: [packages/cli/src/sync.ts#L121-L125](../../packages/cli/src/sync.ts#L121-L125).
- The CLI prints that raw parser message: [packages/cli/src/bin.ts#L78-L80](../../packages/cli/src/bin.ts#L78-L80).

**Adversarial reproduction.**

~~~toml
[mcp_servers.x.env]
TOKEN = "SECRET_MARKER_7f31" trailing
~~~

<code>roster sync --client codex</code> exited 1, but stderr included the full token-bearing source line.

**Impact.** Credentials can enter terminal scrollback, captured build logs, support transcripts, or client launch logs despite the explicit never-logged promise.

**Required correction.** Convert parser exceptions into a safe error code plus path/line/column. Never emit raw source excerpts for config files that may contain credentials.

**Regression gate.** Exercise marker-bearing malformed TOML plus malformed JSONC/YAML discovery. Assert that the marker is absent from stdout, stderr, public exception messages, and receipt output.

### R6-14 | HIGH | CONFIRMED | The committed dependency-audit gate currently fails

**Promise affected.** STATUS “green everywhere” and the CI audit gate.

**Code path.** CI runs <code>pnpm audit --audit-level moderate</code>: [.github/workflows/ci.yml#L131-L147](../../.github/workflows/ci.yml#L131-L147).

**Observed result on reviewed HEAD.**

| Severity | Package/version | Path | Advisory / patched version |
|---|---|---|---|
| High | <code>adm-zip 0.5.18</code> | Transformers → onnxruntime-node | GHSA-xcpc-8h2w-3j85; <code>>=0.6.0</code> |
| High | <code>fast-uri 3.1.3</code> | MCP SDK/Ajv and router Ajv | GHSA-v2hh-gcrm-f6hx; <code>>=3.1.4</code> |
| High | <code>sharp 0.34.5</code> | Transformers | GHSA-f88m-g3jw-g9cj; <code>>=0.35.0</code> |
| Moderate | <code>protobufjs 7.6.4</code> | Transformers → onnxruntime-web | GHSA-j3f2-48v5-ccww; <code>>=7.6.5</code> |
| Moderate | <code>@hono/node-server 1.19.14</code> | MCP SDK | GHSA-frvp-7c67-39w9; <code>>=2.0.5</code> |

Audit metadata reported 301 total dependencies, 3 high, 2 moderate, and 0 critical vulnerabilities.

**Impact.** A clean checkout currently cannot satisfy the audit job in the nine-job pipeline advertised by [STATUS-FOR-MO.md](../../STATUS-FOR-MO.md). Exploitability varies by runtime path, but the release gate is objectively red.

**Required correction.** Upgrade/override to patched dependency graphs, rerun the full suite and live dense path, and document any optional-dependency exception instead of calling the gate green.

### R6-15 | HIGH | CONFIRMED | Eject integrity and era-closure failures can exit zero

**Promise affected.** Safe, auditable recovery.

**Code path.**

- Corrupt pristine manifests/bytes return action <code>no-backup</code>: [packages/cli/src/eject.ts#L36-L66](../../packages/cli/src/eject.ts#L36-L66).
- The CLI treats <code>no-backup</code> as a harmless skip: [packages/cli/src/bin.ts#L99-L111](../../packages/cli/src/bin.ts#L99-L111).
- Failure of both closure mechanisms still returns action <code>restored</code>: [packages/cli/src/eject.ts#L133-L149](../../packages/cli/src/eject.ts#L133-L149).

**Adversarial reproduction.** A tampered backup produced exit status 0, printed <code>skipped</code> plus an integrity-failure detail, and left the client rosterized. Total era-closure failure likewise returned success.

**Impact.** Automation and users cannot distinguish these outcomes reliably through the action or exit status. A human or bespoke parser may notice the stdout detail, but ordinary success/failure handling sees success.

**Required correction.** Add explicit integrity-failure and closure-failure actions, emit them on stderr, and exit nonzero. Preserve a documented repair path: after target restoration lands, current bytes equal the original rather than <code>writtenSha256</code>, so an ordinary retry currently hits the modified guard.

**Regression gate.** Assert that corrupt manifests, corrupt original bytes, and total closure failure all exit nonzero; total closure failure must do so even when target restoration landed. Verify that the documented repair command then succeeds.

### R6-16 | MEDIUM | CONFIRMED | Standard <code>--client=value</code> syntax can broaden destructive scope

**Code path.**

- <code>flagValue()</code> recognizes only two separate argv tokens: [packages/cli/src/bin.ts#L40-L44](../../packages/cli/src/bin.ts#L40-L44).
- An undefined client means all write clients: [packages/cli/src/bin.ts#L62-L64](../../packages/cli/src/bin.ts#L62-L64), [packages/cli/src/bin.ts#L86-L88](../../packages/cli/src/bin.ts#L86-L88).

**Impact.** <code>roster eject --client=cursor --force</code> can raw-restore all write clients. A bare <code>--client</code> also broadens rather than failing.

**Required correction.** Use a real argument parser or strictly validate every token. Unknown, missing, duplicated, and equals-form flags must either parse correctly or fail before mutation.

### R6-17 | MEDIUM | CONFIRMED | Sixth Man never retains the actual K+1 bench

**Promise affected.** Next-ranked equivalent suggestion after a hard failure.

**Code path.**

- Draft requests exactly K and caches only returned visible IDs: [packages/router/src/rosterServer.ts#L243-L245](../../packages/router/src/rosterServer.ts#L243-L245).
- Suggestion searches only that cache: [packages/router/src/rosterServer.ts#L341-L365](../../packages/router/src/rosterServer.ts#L341-L365).

**Adversarial reproduction.** With K=1 and two equivalent tools, failure of the selected tool returned no <code>_roster</code> suggestion because the second-ranked candidate was never retrieved or cached.

**Required correction.** Internally retrieve at least K+bench-depth, expose only K, and cache the hidden ordered bench with schema/source constraints. Add K=1 through K=10 tests.

**Additional defects.** <code>hard_fail:protocol</code> is excluded from the suggestion classes: [packages/router/src/rosterServer.ts#L46-L50](../../packages/router/src/rosterServer.ts#L46-L50). A call need not belong to the supplied draft, and omitting <code>draft_id</code> silently uses the last draft: [packages/router/src/rosterServer.ts#L275-L285](../../packages/router/src/rosterServer.ts#L275-L285).

### R6-18 | MEDIUM | CONFIRMED | “Nightly” Coach maintenance runs only at serve startup

**Promise affected.** A nightly CPU-only job refines routing.

**Code path.**

- The maintenance function is opportunistic and debounced: [packages/coach/src/store.ts#L144-L160](../../packages/coach/src/store.ts#L144-L160).
- Its only production caller runs once during serve boot: [packages/cli/src/serve.ts#L85-L95](../../packages/cli/src/serve.ts#L85-L95).

**Impact.** A long-running router never performs another maintenance pass. A boot before the embedding model warms can also mark the period complete before OATS has useful vectors, deferring refinement until another due boot.

**Required correction.** Add an in-process unref'd schedule or an explicit OS scheduler/job, with single-run locking across processes, retry semantics, and observability.

### R6-19 | MEDIUM | CONFIRMED | Runtime output-schema violations are attributed as caller mistakes

**Promise affected.** Outcome learning and drift classification.

**Code path.**

- The MCP SDK can throw <code>InvalidParams (-32602)</code> when structured output violates the declared output schema.
- Router maps every <code>-32602</code> to <code>inputValidationError</code>: [packages/router/src/backends.ts#L223-L227](../../packages/router/src/backends.ts#L223-L227).
- Coach classifies that evidence as <code>tool_fail:schema</code> and excludes it from attribution, rather than output drift: [packages/coach/src/classifier.ts#L30-L41](../../packages/coach/src/classifier.ts#L30-L41), [packages/coach/src/classifier.ts#L102-L118](../../packages/coach/src/classifier.ts#L102-L118).

**Adversarial reproduction.** Output <code>{count:"NOT A NUMBER"}</code> against a required numeric output property produced input-validation evidence. Missing structured content became a protocol error. Neither path became <code>schema_drift_suspect</code>.

**Impact.** A backend violating its own output contract is not penalized or surfaced as drift, while the event is represented as the caller's malformed arguments.

**Required correction.** Preserve call phase/context around SDK validation errors so input and output validation can be distinguished. Add real-wire SDK fixtures for both directions.

### R6-20 | MEDIUM | CONFIRMED | Canonically equivalent schemas can cause false drift

**Code path.** <code>defHash()</code> hashes insertion-order-sensitive <code>JSON.stringify()</code>: [packages/coach/src/store.ts#L100-L113](../../packages/coach/src/store.ts#L100-L113).

**Adversarial reproduction.** Reordering an otherwise identical schema from properties <code>{a,b}</code> to <code>{b,a}</code> created one drift event and quarantined the tool.

**Additional asymmetry.** Safety-relevant annotations and execution/task hints are absent from the hash, so meaningful contract changes there are invisible while harmless object-key reorderings alarm.

**Required correction.** Canonicalize JSON recursively before hashing and explicitly define every contract field included in drift identity.

### R6-21 | MEDIUM | CONFIRMED | League category and suite comparability are not bound

**Promise affected.** Identical suites and meaningful within-category ranking.

**Code path.**

- League's suite map retains task ID and signed status, not category or task-content identity: [apps/league/src/build.ts#L30-L58](../../apps/league/src/build.ts#L30-L58).
- Certification does not compare artifact category to suite category.
- Standings group the artifact's free-form category and mix suite versions within it: [apps/league/src/pages.ts#L53-L74](../../apps/league/src/pages.ts#L53-L74).
- The environment digest hashes suite name/version and platform basics, not suite bytes or tested server identity: [packages/combine/src/results.ts#L57-L61](../../packages/combine/src/results.ts#L57-L61).

**Adversarial reproduction.** The committed filesystem artifact was relabeled as category <code>github</code> and still certified.

**Impact.** Different task definitions, suite versions, or targets can appear comparable under one heading. A server can also appear multiple times.

**Required correction.** Bind category, suite-content digest, suite version, target identity, runner version, and scoring policy into certification. Partition standings by a strict comparison key.

**Regression gate.** Relabel category, alter suite bytes without a version bump, change suite version/target identity, and submit multiple runs for one server. None may remain in the same comparison group without an identical certified comparison key.

### R6-22 | MEDIUM | CONFIRMED | League's copyable reproduce command is shell-injectable

**Code path.**

- Free-form category and server values are HTML-escaped but inserted unquoted into a shell command: [apps/league/src/pages.ts#L153-L158](../../apps/league/src/pages.ts#L153-L158).
- The displayed command contains a <code>&lt;server command&gt;</code> placeholder rather than the tested immutable target; the wider provenance/reproducibility gap is covered by R6-04 and R6-21.

**Adversarial reproduction.** Values containing <code>; $(...); #</code> survived in the displayed command. Copying the command would execute the injected shell payload.

**Required correction.** Generate arguments as a safely quoted argv representation, never as interpolated shell. Prefer a structured copyable argv block over a shell command.

### R6-23 | MEDIUM | CONFIRMED | Verifier filesystem checks can follow symlinks, false-pass, or hang

**Code path.**

- <code>statSync()</code> and <code>readFileSync()</code> follow symlinks: [packages/combine/src/runner.ts#L177-L200](../../packages/combine/src/runner.ts#L177-L200).
- <code>fileAbsent</code> uses <code>existsSync()</code>, so a dangling symlink counts as absent: [packages/combine/src/runner.ts#L187-L188](../../packages/combine/src/runner.ts#L187-L188).
- Reads are unbounded and outside the invocation timeout.

**Impact.** A target can point an expected path outside the task workspace, satisfy absence with a dangling link, or hang/OOM the verifier with a FIFO or huge file.

**Required correction.** Use <code>lstat</code>, reject symlinks unless explicitly part of the task, verify canonical paths remain under the workspace, bound reads, and apply a verifier timeout.

### R6-24 | MEDIUM | CONFIRMED | Transparent passthrough strips valid Tool fields and request context

**Code path.**

- <code>CapabilityEntry</code> models title, annotations, schemas, and execution, but not Tool <code>icons</code> or <code>_meta</code>: [packages/shared/src/types.ts#L4-L25](../../packages/shared/src/types.ts#L4-L25).
- Backend discovery cannot preserve those fields: [packages/router/src/backends.ts#L128-L147](../../packages/router/src/backends.ts#L128-L147).
- Transparent list cannot emit them: [packages/router/src/rosterServer.ts#L166-L177](../../packages/router/src/rosterServer.ts#L166-L177).
- Call handling forwards only name/arguments and invokes a plain backend call, dropping request context: [packages/router/src/rosterServer.ts#L124-L137](../../packages/router/src/rosterServer.ts#L124-L137), [packages/router/src/backends.ts#L183-L187](../../packages/router/src/backends.ts#L183-L187).
- Error mapping preserves codes/text but has no channel for structured error data: [packages/router/src/backends.ts#L205-L230](../../packages/router/src/backends.ts#L205-L230).

**Adversarial reproduction.** A direct tool containing title, icon, and vendor <code>_meta</code> emerged through Roster with title but without icon or metadata.

**Impact.** The specific README promise for titles and annotations is met, but the broader “faithful passthrough” claim is not. Error data, call request metadata, and cancellation/progress context have related gaps.

### R6-25 | MEDIUM | CONFIRMED | Existing learned OATS vectors can outlive their evidence window

**Code path.** When fewer than four current positive needs remain, <code>runOats()</code> increments <code>skipped</code> but does not clear the existing adjustment vector: [packages/coach/src/store.ts#L821-L828](../../packages/coach/src/store.ts#L821-L828).

**Adversarial reproduction.** After creating an adjusted vector and advancing 91 days, <code>runOats()</code> returned <code>{adjusted:0, skipped:1}</code>; the old non-null adjustment remained active.

**Impact.** Routing can continue using evidence beyond the represented 90-day window.

**Required correction.** Clear/recompute expired adjustments when the current evidence set no longer satisfies the minimum, and test time-window transitions explicitly.

### R6-26 | MEDIUM | CONFIRMED | Existing client edits remain vulnerable to read/replace races

**Code path.**

- Sync snapshots once, performs backup/config work, then replaces the target without compare-and-swap: [packages/cli/src/sync.ts#L61-L114](../../packages/cli/src/sync.ts#L61-L114).
- State-file eject reads, merges, and replaces without retrying if the live file changed: [packages/cli/src/eject.ts#L79-L90](../../packages/cli/src/eject.ts#L79-L90).
- Dedicated eject hashes, then replaces through a separate operation: [packages/cli/src/eject.ts#L108-L121](../../packages/cli/src/eject.ts#L108-L121).

**Impact.** A client updating its live state file between snapshot/hash and rename can lose that update. This is especially relevant to files the implementation itself describes as constantly rewritten.

**Required correction.** Recheck identity/version immediately before publish and retry key-level merges on change. Combine this with the lifecycle lock from R6-03.

### R6-27 | MEDIUM | CONFIRMED | Central Roster config updates remain last-writer-wins

<code>init</code>, <code>sync</code>, and telemetry use unlocked read-modify-write cycles: [packages/cli/src/init.ts#L15-L24](../../packages/cli/src/init.ts#L15-L24), [packages/cli/src/sync.ts#L74-L78](../../packages/cli/src/sync.ts#L74-L78), [packages/cli/src/telemetry.ts#L8-L22](../../packages/cli/src/telemetry.ts#L8-L22). Atomic replacement prevents torn JSON but explicitly remains last-writer-wins: [packages/cli/src/rosterfile.ts#L26-L32](../../packages/cli/src/rosterfile.ts#L26-L32). Concurrent successful operations can discard a newly imported server or telemetry change.

**Required correction.** Use an advisory lock or revisioned compare/retry around the complete transaction, not only the final file write.

**Regression gate.** Barrier-start two real processes after each loads a distinct config update; both may report success only if both definitions survive. Also race telemetry toggling against server import.

### R6-28 | MEDIUM | CONFIRMED | Wall-clock ordering can hide a new backup

Backup names derive from wall time: [packages/cli/src/sync.ts#L91-L93](../../packages/cli/src/sync.ts#L91-L93). The <code>.closed-through</code> filter compares names lexicographically: [packages/cli/src/sync.ts#L261-L270](../../packages/cli/src/sync.ts#L261-L270). After marker success plus archive failure, a clock rollback can create a legitimate new backup whose timestamp sorts before the closed boundary. It becomes invisible to eject while the client remains rosterized. The prerequisite is narrower than R6-03 and the bytes remain manually recoverable, but the normal restore path is lost.

**Required correction.** Use random/monotonic era IDs with explicit parent/closed metadata instead of wall-clock ordering.

**Regression gate.** Force archive failure with marker success, then create a new backup whose timestamp sorts earlier. Assert that the new era remains visible and automatically restorable.

### R6-29 | LOW | STATICALLY CONFIRMED | “Atomic” config and backup publication is not power-loss durable

Target writes and backup publication rename temporary files/directories without fsync of file contents and parent directories: [packages/cli/src/rosterfile.ts#L43-L49](../../packages/cli/src/rosterfile.ts#L43-L49), [packages/cli/src/sync.ts#L97-L114](../../packages/cli/src/sync.ts#L97-L114). This is atomic against normal process interruption after syscall completion, but not guaranteed durable across OS crash or power loss.

**Required correction.** Either add and instrument file/directory fsync at critical trust boundaries, or narrow comments and documentation from crash-durable to process-atomic. A normal unit test alone cannot prove power-loss durability.

### R6-30 | LOW | CONFIRMED | Backend identity can shift when normalized names collide

Collision suffixes are assigned from currently connected backends in connection order: [packages/router/src/backends.ts#L70-L95](../../packages/router/src/backends.ts#L70-L95). If two configured names normalize to the same source and one is unavailable on a later boot, the remaining physical server can inherit the other's formerly unsuffixed capability IDs and learned history. De-suffix outage protection can retain unreachable ghosts: [packages/coach/src/store.ts#L370-L380](../../packages/coach/src/store.ts#L370-L380). STATUS already discloses this exotic boot-order identity issue.

**Required correction.** Persist stable backend identities independent of availability and boot order.

### R6-31 | MEDIUM | CONFIRMED | Incomplete artifact validation can crash the complete League build

**Code path.**

- Artifact parsing validates only <code>environment.node</code>: [apps/league/src/artifact.ts#L60-L61](../../apps/league/src/artifact.ts#L60-L61).
- Page rendering assumes <code>platform</code> and <code>arch</code> are strings: [apps/league/src/pages.ts#L153-L158](../../apps/league/src/pages.ts#L153-L158).

**Adversarial reproduction.** Removing <code>environment.platform</code> passed parsing and then caused <code>buildSite()</code> to throw a <code>TypeError</code>, aborting the full site build instead of skipping the malformed artifact.

**Impact.** One malformed or partially written artifact can deny publication of every otherwise valid League page.

**Required correction.** Strictly validate every environment field before certification and isolate rendering per artifact. A malformed artifact must be reported and skipped without aborting valid outputs.

**Regression gate.** Remove each required environment field, supply wrong types, and truncate individual artifacts. Assert a nonzero/explicit validation report while valid artifacts still render and stale output is not retained.

## README promise ledger

### 1. Neutral, local-first router that works with any MCP client

**Status: PARTIAL.**

The protocol endpoint and ordinary stdio proxy are client-neutral. Read discovery supports ten client formats, but write sync supports only four: [packages/cli/src/sync.ts#L19-L20](../../packages/cli/src/sync.ts#L19-L20). Only one existing candidate path per client is written per invocation. Streamable HTTP backends are skipped, and required task-based tools are not supported.

“Anything else that speaks the protocol” is therefore too broad for the current proxy and installer.

### 2. Exact eject

**Status: NOT FULFILLED.**

Dedicated single-path byte restore, state-file key merge, and force restore work in uncontended happy paths. R6-02, R6-03, R6-15, R6-26, and R6-28 show that the global “every client exactly as found” guarantee is not yet supportable. R6-16 is a separate destructive-scope CLI parsing defect rather than a failure of the restore algorithm itself.

### 3. Faithful transparent passthrough

**Status: NOT FULFILLED.**

Namespacing, ordinary results, title, annotations, output schema, execution hints, and most error codes are preserved. Recorder failures change successful call truth; required tasks fail; icons/vendor metadata and request context are lost; URL/config-rich definitions cannot be served.

### 4. Five mode with best K between one and ten

**Status: PARTIAL.**

The surface correctly exposes only <code>draft</code> and <code>call</code>, clamps K, and returns at most K visible cards. Relevance retrieval works. “Best” is overstated while statistically strong local reliability is excluded from the normal full candidate set.

### 5. Sixth Man next-ranked suggestion

**Status: PARTIAL.**

Suggest-only behavior is honored, and default-K internal failure tests pass. The implementation does not retain K+1, so K=1 cannot suggest the actual next-ranked candidate.

### 6. Local outcome learning and nightly CPU-only refinement

**Status: NOT FULFILLED AS DESCRIBED.**

Local outcome storage, classification, Wilson computation, FTS, dense retrieval, and OATS machinery exist. Raw call arguments/results are not stored. Ratings normally do not alter a full draft, maintenance is boot-only, expired adjustments can remain active, and Lab priors are absent.

### 7. Public League from identical human-signed suites

**Status: NOT FULFILLED.**

The static generator and Wilson lower-bound threshold exist. Artifact authenticity is not enforced; unsigned names/scores render; suite/category/target identity is not bound; host execution is not isolated; and only an unsigned eight-task filesystem artifact currently exists.

The README and methodology promise displayed confidence intervals ([README.md § League](../../README.md#what-it-is), [docs/methodology.md § principles](../methodology.md#0-principles)), but <code>RunSummary</code> stores only lower bounds and standings render only that point: [packages/combine/src/results.ts#L6-L16](../../packages/combine/src/results.ts#L6-L16), [apps/league/src/pages.ts#L45-L48](../../apps/league/src/pages.ts#L45-L48). Praise asymmetry and the 14-day reply window are also manual launch gates rather than generator state: methodology requires them ([docs/methodology.md § praise asymmetry](../methodology.md#5-praise-asymmetry-at-launch)), while the renderer names every accepted run ([apps/league/src/pages.ts#L39-L49](../../apps/league/src/pages.ts#L39-L49)).

CI has no scheduled trigger ([.github/workflows/ci.yml#L1-L6](../../.github/workflows/ci.yml#L1-L6)), and its fresh Combine output is not promoted to the committed artifact directory used by the site. The methodology's “No results exist yet” sentence should be narrowed to “no signed/publishable results”: an unsigned 8/8 artifact does exist at [docs/verification/2026-07-04-filesystem-lab-results.json](../verification/2026-07-04-filesystem-lab-results.json).

### 8. Playbook unified skill index, bridge, allowlists, and trust scan

**Status: PARTIAL.**

SKILL.md parsing, full-body unified indexing, a callable bridge in five mode, and a boundary trust filter exist. Transparent mode lists only backend tools, per-agent allowlist writing is absent, and extensionless executable scripts bypass the scanner. Methodology's provenance-flag component is explicitly implementation-pending and is not present in the current trust inputs.

### 9. Init under 60 seconds, no account/key/cloud, truthful receipt

**Status: PARTIAL.**

There is no account or Roster API key. Receipt handling distinguishes native tool-search clients. Per-tool/token depth is correctly disclosed as future work. URL/config-rich imports and proxy-shaped legitimate servers make “import every server” false.

### 10. Context relief in every client

**Status: PARTIAL.**

Five mode provides context relief for clients that use it. Mode is manual, write support covers four clients, and the default transparent mode exports every backend tool. The README correctly notes native deferral for Claude Code.

### 11. One roster synced everywhere

**Status: NOT FULFILLED.**

Central <code>roster.json</code> exists, but only four writers are implemented, one existing candidate path is selected per invocation, unsupported entry fields are dropped, and URL backends cannot run. Add/remove propagation is not universal.

### 12. Flight recorder dashboard

**Status: NOT BUILT.**

The SQLite outcome table is a useful foundation. There is no dashboard or equivalent user-facing recorder view. STATUS already discloses this gap.

### 13. Drift alarms

**Status: NOT FULFILLED.**

Definition hashing, event storage, and selection quarantine exist. There is no user-visible alarm, cached/forced calls can still execute a quarantined tool, and non-canonical hashing false-alarms. The 24-hour auto-clear is disclosed elsewhere, but its relationship to the separately advertised manual unquarantine command remains ambiguous.

### 14. Secrets hygiene

**Status: PARTIAL.**

Roster config and backups use restrictive owner-only POSIX permissions, environment blocks are intentionally copied locally, no raw credential/argument/result values were observed in outcome rows, and no telemetry uploader exists. Malformed TOML can leak its credential-bearing source line to stderr. Windows ACL equivalence remains unverified.

### 15. Reliability-aware defaults seeded from public Lab data

**Status: NOT BUILT.**

No Lab-prior loader or seed file exists. Local ratings are used only as an underfill fallback.

### 16. No cloud calls at runtime

**Status: WORDING CONTRADICTION.**

The same README bullet says both “no cloud calls at runtime” and that an embedding model is fetched from Hugging Face in the background. Code enables that fetch path during serve when embeddings are automatic unless <code>ROSTER_NO_FETCH</code> is set: [packages/cli/src/serve.ts#L67-L70](../../packages/cli/src/serve.ts#L67-L70).

Inference remains local and prompts/tool arguments/results are not sent to Hugging Face. The accurate wording is “no hosted inference or content upload; an optional model artifact may be downloaded at runtime.”

### 17. Content privacy and telemetry off

**Status: MOSTLY FULFILLED FOR THE IMPLEMENTED SCOPE.**

Raw tool arguments/results are not persisted in the outcome database. Telemetry defaults off; toggling it only changes local configuration; there is no event builder, uploader, or endpoint. The malformed-TOML diagnostic issue is a secrets/configuration-logging breach covered by promise 14; it does not show tool-call prompts, arguments, or results leaving the machine.

### 18. Pre-release, unpublished, and unhosted

**Status: ACCURATELY DISCLOSED.**

The README plainly says Quickstart commands do not work today, npm publication is pending, and no domains/telemetry endpoint are live. These are honest future items and were not graded as implementation defects.

## What held up under review

The blocked verdict should not obscure the parts that are solid:

- All 191 committed tests pass serially.
- TypeScript project references typecheck.
- Biome lint passes.
- Every workspace package builds.
- Real filesystem and memory servers work through the compiled binary in both transparent and five mode.
- Ordinary backend tool names are stable within a non-collision boot and are namespaced.
- Title, annotations, input/output schemas, and execution hints survive ordinary transparent listing.
- Most backend protocol error codes survive transparent forwarding.
- Five mode exposes exactly the two intended meta-tools and clamps K to 1–10.
- Local outcomes store hashes and classifications, not raw prompts, arguments, or results.
- FTS is available immediately; dense retrieval is optional and falls back to lexical on warmup failure.
- Telemetry is off by default and cannot currently upload anything.
- POSIX Roster config/backup files and protected directories are created with restrictive modes.
- Wilson lower-bound math is correct.
- League rejects duplicate artifact task IDs and re-derives summaries from the supplied rows rather than trusting claimed summary arithmetic.
- Known-suite artifacts must contain the complete known task-ID set.
- The 30-signed-task rank threshold is enforced on the normal build path.
- Combine uses a fresh process per task and enforces connect/call timeouts.
- Combine redacts backend result/error text from persisted current artifacts.
- Playbook parses SKILL.md bodies and withholds scripts it actually identifies as review-worthy.
- The README clearly discloses pre-release/package/hosting status and telemetry's current inertness.

## Why the existing tests remained green

The current suite is valuable but concentrates on intended serial paths. The confirmed defects occupy omitted state-space:

- Recorder tests assume a healthy writable database.
- Eject tests use a client's first path and do not interleave a new sync between target restore and era closure.
- CLI tests do not cover <code>--client=value</code>, corrupt-backup exit status, or structural proxy false positives.
- Router tests do not run required-task tools, preserve request context, or inject recorder failures after backend success.
- Ranking tests validate search and rating math independently, not that reliability changes a fully populated draft.
- Sixth Man tests use a default K with another visible candidate, not K=1 with a hidden K+1.
- Drift tests inspect storage, not a production notification surface or forced-call enforcement.
- Trust tests use recognized script extensions, not executable extensionless files.
- Combine tests constrain verifier paths lexically but do not run a hostile target against the host boundary.
- League tests validate arithmetic and task-set completeness but not authenticated execution provenance.
- Audit is a separate CI job and is presently red even though unit/build/static checks pass.

Passing tests therefore establish the implemented happy paths; they do not establish the broader README guarantees.

## Required launch gates

### P0 — trust and truth boundaries

1. **Call truth isolation**
   - A completed backend call must be returned unchanged even when all local recorder operations fail.
   - Invocation count must remain one under every recorder failure.

2. **Transactional per-path eject**
   - Backup identity includes canonical source path.
   - Sync/eject share an interprocess lifecycle lock.
   - Interrupted restore is journaled and recoverable.
   - Client-wide eject restores every active path before closing any.
   - Integrity/closure errors exit nonzero.

3. **Authenticated League evidence**
   - Publication accepts only attested trusted-run artifacts.
   - Attestation binds target identity, complete suite bytes, category, results, environment image, and runner/methodology versions.
   - Unsigned evidence cannot produce a named row or score.

4. **Real Combine isolation**
   - Target process cannot access host filesystem, host environment, or network without explicit task capability.
   - Symlink, FIFO, huge-file, child-process, and timeout escape tests pass.

5. **Safe sync refusal**
   - A client is never rewritten when a removed entry's transport or required fields are not losslessly representable by the supported router model.
   - Remote headers/auth, cwd, transport options, and filters round-trip or cause a clear refusal.

### P1 — core product promises

6. Required MCP task tools either work end-to-end, including cancellation/progress/meta, or are explicitly withheld.
7. Reliability is an active, validated signal in every normal draft.
8. Nightly maintenance actually recurs and is single-run safe across processes.
9. Drift events reach a user-visible surface and quarantine is enforced at call time.
10. Sixth Man retains and tests the hidden K+1 bench for every supported K.
11. Playbook scans all executable candidates and reports skipped/unreadable candidates as review-required.
12. Parser diagnostics are content-redacted.
13. Dependency audit returns zero moderate-or-higher advisories or carries a narrowly documented, time-bounded exception.

### P2 — day-one completeness and truthful copy

14. Implement or remove from day-one copy: flight recorder dashboard, universal sync, per-agent allowlists, public Lab priors, confidence intervals, and hosted League.
15. Align README/STATUS wording with implemented transport/client coverage.
16. Replace “no cloud calls at runtime” with the precise model-download boundary.
17. Add exact reproducibility metadata and safe argv rendering to League pages.

## Suggested regression matrix

| Surface | New mandatory cases |
|---|---|
| Router recorder | closed DB, read-only DB, SQLite busy/locked, disk full, corrupt DB, hash failure; successful backend result unchanged |
| MCP fidelity | required/optional tasks, progress, cancellation, request/result <code>_meta</code>, icons, error data, output validation |
| Ranking | equal relevance/different reliability; irrelevant high reliability; cold start; rating expiry; Lab prior merge |
| Sixth Man | K=1..10, hidden K+1, source diversity, schema compatibility, protocol/transport failures |
| Drift | canonical key reorder, annotations/execution changes, notification, forced-call rejection, explicit unquarantine |
| Sync import | remote headers/auth, cwd, filters, disabled state, URL transports, legitimate npx serve; read-import across ten dialects and safe rewrite/eject across four supported write clients |
| Eject | every path candidate, two project paths, simultaneous state/dedicated selection, sync/eject barriers, crash at each rename, clock rollback |
| CLI args | equals/separate form, missing value, unknown flag, duplicated flag, destructive scope assertions |
| Playbook | extensionless executable, shebang, PowerShell/batch/cmd, hidden script, symlink, unreadable/oversized candidate |
| Combine | host read/write, network egress, symlink/FIFO, huge file, child survival, process group kill, immutable image |
| League | handwritten rows, altered result, replay, copied target, category relabel, suite-byte change, unsigned name leak |
| CI | clean-checkout audit, dense inference after dependency overrides, Linux/macOS/Windows config and containment behavior |

## Verification record

### Passed

~~~text
pnpm test
  11 test files passed
  191 tests passed

pnpm typecheck
  passed

pnpm lint
  passed

pnpm build
  passed

node docs/verification/e2e.mjs
  transparent filesystem + memory passed
  five mode filesystem + memory passed

Focused package review:
  router + coach: 105 tests passed
  CLI: 30 tests passed
  Playbook + Combine + League: 42 tests passed
~~~

The E2E command generated a dated transcript as part of its normal behavior; that review-only artifact was removed after inspecting it so this report remains the only retained change.

### Failed

~~~text
pnpm audit --audit-level moderate
  3 high
  2 moderate
  exit nonzero
~~~

### Focused adversarial/runtime reproductions

- Successful backend result hidden by recorder failure.
- Reliability-inverted draft after 100 failures versus 100 successes.
- Required-task tool listed but never invoked.
- K=1 failure without a hidden Sixth Man.
- Drift quarantine bypass through forced call.
- Equivalent schema reorder causing drift.
- Output-schema violation attributed as input error.
- Two-path eject stranding the second config.
- Sync/eject lifecycle interleaving closing the new backup.
- Crash-window stale-era restore.
- Remote URL/header loss followed by zero routed tools.
- Legitimate <code>npx ... serve</code> server skipped as false self.
- Secret-bearing malformed TOML echoed to stderr.
- Handwritten 30/30 League artifact ranked.
- League category relabel retained certification.
- Unsigned named score rendering.
- Extensionless <code>curl | bash</code> skill passing trust.
- Shell payload retained in a copyable League command.
- Missing League environment field crashing the build.

All reproductions used throwaway temporary directories or in-memory fixtures. No fixture, generated site, database, client config, or reproduction script remains in the repository.

## Final decision

The current code is suitable for continued private development and targeted tester work where configurations are backed up independently and League output is treated as non-authoritative. It is **not suitable for a public release carrying the current trust promises**.

The fastest credible path is not to finish every roadmap feature. It is to first make five boundaries true:

1. A successful call is always reported as successful regardless of recorder health.
2. Every touched config path remains discoverable and automatically restorable across concurrency and process death.
3. A public score proves an authenticated execution of immutable human-reviewed tasks.
4. A probed server is actually isolated from the host.
5. Sync never removes a working definition Roster cannot faithfully represent.

After those are locked with adversarial tests, the next release gate is making the product's core differentiation real in normal use: reliability-aware drafts, recurring maintenance, enforceable drift handling, and a true hidden K+1 Sixth Man.

Until then, README and STATUS should describe Roster as a strong local stdio prototype with an unfinished trust and publication layer—not as a no-risk exact-restoration proxy with authenticated public rankings.
