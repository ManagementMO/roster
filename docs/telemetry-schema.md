# Telemetry schema — v1

This file is the schema of record for Roster's opt-in telemetry. If an event isn't described here, Roster doesn't send it.

## The stance

- **OFF by default.** A fresh install sends nothing, ever. Before launch, the OFF default is verified by packet capture, and that verification is part of the release checklist.
- **Opt-in only.** Upload happens only after an explicit `roster telemetry on`. `roster telemetry status` prints your current setting and points here for the exact schema and what would be sent; `roster telemetry off` stops it.
- **Local-first.** All outcome data collects on your own disk regardless, and the Coach's learning runs entirely locally. Telemetry adds nothing you need — it exists solely to feed the League's observational (Street) statistics, and it is anonymized and thresholded as described below.
- **The upload endpoint does not exist yet.** No event-builder or upload code exists — `roster telemetry on` records a local consent flag and nothing more. Nothing can leave your machine even with telemetry switched on, and no endpoint will be stood up without owner approval.

## The event

One event per tool-call outcome, only after explicit opt-in:

```json
{"v":1,"install":"uuid-rotated-monthly","server":"github@1.2.3","tool":"create_issue","cat":"github",
 "class":"success","lat_bucket":"250-1000","model":"claude","spec":"2026-07-28"}
```

### Every field, explained

| Field | Meaning |
|---|---|
| `v` | Schema version. Currently `1`. **Any** change to this schema bumps `v` and is announced before it ships. |
| `install` | Rotating install pseudonym. Exists only so k-anonymity thresholds can count *distinct* installs. The sketch above shows the original monthly-rotated UUID; the adopted design (project decision record, finding M7) is a **seasonal salted pseudonym** — an HMAC of a local install secret and the season epoch — stable within a season so distinct-install counts are real, unlinkable across seasons so there is no long-term identifier. Never a hardware ID, account, or network-derived value. This logic sits on the line-by-line human-review list (see [PROVENANCE.md](PROVENANCE.md)). |
| `server` | The backend server's registry identity and version, `<id>@<version>` (e.g. `github@1.2.3`) — the package identity as declared, never a hostname or URL. |
| `tool` | The tool name as declared by the server (e.g. `create_issue`). |
| `cat` | Coarse capability category Roster assigned to the call (e.g. `github`, `filesystem`, `search`). Not the user's words — a fixed category label. |
| `class` | Outcome class from the local success classifier: `success`, `hard_fail:transport`, `hard_fail:protocol`, `tool_fail:<auth\|quota\|schema\|timeout\|internal\|other>`, or `schema_drift_suspect`. Only tool-attributable classes feed public ratings; agent-side confusion signals (soft failures) stay local. |
| `lat_bucket` | Latency bucket only: `<250`, `250-1000`, `1000-4000`, or `>4000` (milliseconds). Raw latencies stay local. |
| `model` | Model *family* the client reported (e.g. `claude`) — no versions, no account details. |
| `spec` | MCP spec revision the call was served under (e.g. `2026-07-28`). |

## Hard exclusions — never sent

Under no schema version, mode, or flag does telemetry include:

- **prompts**
- **needs** — the plain-language `draft(need)` strings
- **args** — tool arguments
- **results** — tool outputs
- **embeddings**
- **hostnames**
- **paths**

These are not merely omitted by default: the schema has no fields for them, and adding one would require a `v` bump, a public announcement, and a change to the project's binding privacy law (content never leaves the machine) — which is not on offer.

## Publication thresholds (k-anonymity)

Street (observational) statistics publish for a given (server, category) pair only when **both** hold:

- **≥ 5 distinct installs** have reported it, and
- **≥ 200 calls** have been reported for it.

Below threshold, nothing about that pair appears publicly — no partial rows, no "insufficient data" placeholders that leak existence of a lone reporter's traffic.

## Versioning promise

The schema lives here, in the repo, versioned with the code. Any change — field added, removed, or redefined — bumps `v` and is announced before shipping. this file is the schema of record, versioned with the code, so what the docs say and what the binary sends can be compared at any time.
