# Objective Production Hardening Design

Date: 2026-07-22  
Approved direction: full objective-correctness wave  
Baseline: `f50e873d92e062e976ffeab8173ca3d2ffefc078`

## Purpose

Make Roster safe to put in front of ordinary users' MCP configurations without weakening its simple quickstart, local-first privacy boundary, suggest-only failover, or human-signed public-score law. Every change in this wave closes a reproduced correctness or truthfulness defect. Product positioning, visual design, ranking thresholds, telemetry policy, package naming, and learning-model policy remain unchanged.

## Product-level invariants

1. A failed, interrupted, repeated, or concurrent `sync`/`eject` cannot silently lose a server, setting, symlink, or restorable backup.
2. Roster identifies its own config entry by durable exact identity, never by a command-name or argument-shape guess.
3. A client containing an unsupported URL-only backend is left untouched until the router supports that transport.
4. Backend, tool, and skill IDs are deterministic from their raw identity and cannot be inherited by a different physical capability after a collision or outage.
5. A non-terminating backend cannot starve the router's timeout, and a non-terminating close cannot hang boot or shutdown.
6. Coach failures degrade learning only; they never rewrite a successful backend call into a router error.
7. Coach multi-statement invariants are transactional, stale vector writers cannot undo drift/model invalidation, and malformed vectors become repair-eligible.
8. Combine verifiers never follow symlinks outside the sandbox or treat a dangling symlink as absent.
9. An incomplete Playbook filesystem scan is a `review` result, never `ok`.
10. League certification binds task signing, task set, category, suite, and suite version. Only identical certified suites are compared.
11. Generated League output cannot retain a removed page or publish a partially rendered site.
12. Prompts, needs, tool arguments, and tool results are never persisted or logged; existing hash-only outcome storage remains the boundary.

## Architecture

### CLI trust path

Add an owner-only cross-process lock primitive under `~/.roster/locks/`. Roster config mutations use one config lock; each client lifecycle uses one client lock. Lock acquisition waits for a bounded interval, reclaims only provably dead owners, and otherwise fails clearly.

Strictly validate `roster.json` before mutation. Merge operations report both additions and provenance-only changes so every mutation is saved. Config writers use durable private temporary files, atomic rename, and best-effort parent-directory sync.

Sync computes the exact entries Roster currently owns from the current install and intact backup manifests. Generic `npx … serve` and `node …/bin.js serve` shapes are ordinary user servers. A legacy state-file manifest without an exact injected entry fails closed. URL-only backends abort sync before any client or roster mutation.

Symlinked client configs are supported deliberately: the manifest records the visible source path, resolved write target, and raw link target. Writes go to the resolved target, preserving the symlink. Eject refuses if that topology changed.

Eject groups every active backup by source path, validates all groups before writing any target, and records an owner-only pending journal before the first restore. The journal fixes the exact era boundary and desired hashes. Recovery distinguishes not-written, written, already-closed, and externally-modified states by hash; ambiguity refuses rather than guessing. All active paths for a client restore before the era closes.

### Stable capability identity and router liveness

Shared exposes stable, MCP-safe segments. Already-safe raw identifiers retain their readable value; lossy identifiers receive a short SHA-256 suffix derived only from the public raw name. Backend source IDs, raw tool names, and skill slugs all use the same rule.

Tool pagination tracks cursors, rejects cycles, yields to the event loop between pages, and enforces a generous configurable tool ceiling. Connect cleanup and global close have independent deadlines. Coach record/suggestion writes are best-effort. An omitted `draft_id` still permits execution but carries no need attribution or Sixth Man suggestion.

### Coach consistency

`pruneMissing` selects and deletes inside one immediate transaction. `recordOutcome` inserts the outcome, marks a prior retry, and marks a suggestion taken in one transaction.

Warmup writes include the expected definition hash and embedding-model ID in the same SQL statement's predicates. A drift or model switch that wins the race makes the stale insert a no-op. Vector enumeration validates dimensions and finite values: a corrupt base row is deleted; a corrupt adjustment is cleared; malformed need vectors are discarded during OATS instead of aborting maintenance.

### Combine and Playbook

Every verifier uses exact directory entries plus `lstat`; file and directory assertions reject symlinks and realpath escapes. `fileAbsent` succeeds only when no directory entry exists, including dangling links. Suite parsing validates records, positive finite timeouts, object arguments/setup, and string setup contents before execution.

Playbook security discovery traverses hidden entries, identifies extensionless executable files, and flags every symlink, traversal error, or scan-cap exhaustion as an incomplete/untrusted boundary. It does not follow directory symlinks. Router serving continues to withhold every `review` skill by default.

### League integrity and publication

Suite authority is a structured record containing category and per-task signing/description. Tuple keys use JSON arrays, not delimiter concatenation. Certification rejects category mismatches. Standings partition by `(category, suite, suiteVersion)` so unlike tests never share ranks.

Artifact parsing requires canonical ISO timestamps, non-empty identity fields, all environment strings, and a 64-character hexadecimal digest. Box filenames contain a readable slug plus a stable identity hash. The builder renders into a fresh staging directory, checks destination uniqueness, swaps the completed directory into place with rollback, and fails by default when no valid run renders (`--allow-empty` is explicit).

### Compatibility and disclosure

Existing valid R5 manifests continue to work. Legacy dedicated-file byte restores remain possible because exact entry identity is irrelevant there. Legacy state-file key-level restore fails closed and explains that `--force` performs an explicit pristine-byte restore. Lossy capability names may receive new stable IDs; this is a pre-release correction and will be documented.

HTTP/SSE routing is not added in this wave. Sync refusal prevents blackholing and the README/status will state the stdio-only implementation boundary. Known owner decisions remain unchanged.

## Verification standard

Each behavior change begins with a test that fails for the reproduced reason. Important locks are mutation-checked by temporarily reverting the relevant guard and observing the focused test fail. Final gates are `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm league:build`, focused child-process concurrency tests, crash-recovery tests, and a clean-tree diff review.

