# Cross-platform envelope validation tooling

This directory contains the validation tooling for the F10.2 cross-platform
envelope contract.

## Files

| File | Phase | Purpose |
|---|---|---|
| `validate-cross-platform-envelope.mjs` | F10.2.1 | Loads `@h2o/cross-platform-envelope` and verifies the helper's own behavior: positive validation for all fixtures, one negative tamper per blocker code, authority downgrade/reject paths, doc-sync `BLOCKER_CODES` ↔ envelope-v1.md parity, predicate sanity. |
| `run-cross-platform-repo-scan.mjs` | **F10.2.2** | Orchestrator. Runs all repo-level scans and emits a consolidated report. |
| `allowlist.json` | F10.2.2 | Explicit per-rule, per-path exceptions. Every entry requires a `reason`. |
| `scans/util.mjs` | F10.2.2 | Shared helpers: file walker, allowlist match, inline-marker parser, TypeScript AST helpers, helper-package loader. |
| `scans/scan-*.mjs` | F10.2.2 | Nine repo-level scans (see below). |

## How to run

```bash
# Run F10.2.1 helper validation (53 assertions):
node tools/validation/cross-platform/validate-cross-platform-envelope.mjs

# Run F10.2.2 full repo scan:
node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs

# Run a single F10.2.2 scan:
node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs \
  --scan scan-forever-no-fields

# JSON output:
node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs --json

# Promote warnings to hard-fail:
node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs --strict

# Use HEAD..ref instead of staged diff for lockfile-drift:
node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs --diff origin/main

# Include unstaged working-tree changes in lockfile-drift inspection:
node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs --include-unstaged

# Run a single scan in stand-alone mode (self-test + scan):
node tools/validation/cross-platform/scans/scan-forever-no-fields.mjs
```

## Scan matrix

| Rule(s) | Scan module | Hard-fail / Warning |
|---|---|---|
| **CP-1.1**, **CP-1.2** | `scan-kind-literal-drift.mjs` — envelope-tagged literals must carry a `kind` from `ENVELOPE_KINDS`. | Hard-fail |
| **CP-2.1** + **CP-W.1** | `scan-blocker-code-drift.mjs` — blocker-code literals must be in `BLOCKER_CODES`; orphan codes warn. | Hard-fail / Warning |
| **CP-3.1**, **CP-4.1**, **CP-4.2**, **CP-4.3** | `scan-helper-forbidden-patterns.mjs` — helper package must not export envelope constructors, must not import `node:*`, must not call forbidden APIs (`fetch`, `Date.now()`, `globalThis.crypto`, …), must have no top-level side effects. | Hard-fail |
| **CP-5.1** | `scan-apply-event-misuse.mjs` — non-allowlisted runtime file may not contain quoted `'applyEvent'` literal near a write keyword. | Hard-fail |
| **CP-6.1**, **CP-6.2**, **CP-6.3** | `scan-mobile-write-back.mjs` — mobile must not contain SQL writes, must not carry `'applyEvent'`/`'proposal'` kind literals, must not export `apply*`/`commit*`/`mutate*`/`writeBack*` functions. | Hard-fail |
| **CP-7.1** | `scan-cache-metadata-misuse.mjs` — non-allowlisted runtime file may not contain quoted `'cacheMetadata'` literal near a write keyword. | Hard-fail |
| **CP-8.1**, **CP-8.2** | `scan-forever-no-fields.mjs` — envelope-tagged object literals must not contain `FOREVER_NO_FIELD_NAMES` keys, and any `Token`-family key must literally be `previewToken`. | Hard-fail |
| **CP-9.1** + **CP-W.5** | `scan-lockfile-drift.mjs` — lockfile / generated / build-artifact files must not appear in the staged diff. Skipped silently when no git diff context is available. | Hard-fail / Warning |
| **CP-10.1** | `scan-runtime-import-graph.mjs` — files outside `tools/validation/` may not import `@h2o/cross-platform-envelope` until F10.3 explicitly authorizes bridge importers. | Hard-fail |

## False-positive controls

The scans use four layered defenses:

1. **File-glob scope per scan.** Each scan declares `SCOPE_*` globs in
   `scans/util.mjs`. Files outside the scope are never read.
2. **Quoted-literal kind matching.** The kind-name scans match
   `'applyEvent'` / `"applyEvent"` only — not bare identifiers like
   `applyEvents` (audit counter plural) or labels like `"apply events"`.
3. **AST-level envelope-discriminator proximity.** The forever-no /
   kind-literal scans walk only object literals tagged with
   `schema: "h2o.crossPlatform.envelope.v1"`. The
   `FOREVER_NO_FIELD_NAMES` constant in the helper package itself is not
   flagged because those strings appear as array elements, not as
   object keys.
4. **Allowlist with required `reason`** plus inline opt-out markers.

## Adding an allowlist exception

Edit `allowlist.json` and add an entry:

```jsonc
{
  "rule": "CP-5.1",
  "path": "apps/studio/desktop/src-tauri/src/lib.rs",
  "reason": "Why this exception is justified.",
  "expires": null
}
```

Path patterns support a single trailing `/**` for directory match;
otherwise it is an exact match on the repo-relative path. `reason` is
required. `expires` is optional ISO seconds UTC.

## Adding an inline marker

For one-off cases that don't belong in the global allowlist:

```ts
// envelope-scan: allow CP-8.1 reason: legacy fixture preserves historical shape pre-F10.2
const env = { schema: "h2o.crossPlatform.envelope.v1", payload: { content: "legacy" } };
```

The marker is parsed on the line above OR the same line as the
offending construct.

## What this tooling is not

- **Not a bridge.** No transport, no network, no IPC.
- **Not an apply path.** Scans never invoke helper functions that mutate
  state; the helper has no mutation functions.
- **Not a write-back enabler.** Mobile write-back, remote apply,
  WebDAV/cloud relay, and signed-envelope verification remain
  unauthorized.
- **Not a CI integration.** F10.2.2 ships runnable scripts. Wiring into
  the existing release flow is a separate explicit follow-up.

## Phase status

| Phase | Status |
|---|---|
| F10.0 cross-platform architecture | Accepted |
| F10.1 platform capability manifest | Complete (`3bf253f`) |
| F10.2.0 envelope spec | Complete (`febd731`, `92d3eb3`) |
| F10.2.1 static helper | Complete (`a3fb7ac`) |
| **F10.2.2 repo validation scan** | **Current** |
| F10.3 first bridge | Not authorized |
| F10.6 future transports | Not authorized |
| F10.7 remote apply / write-back | Forbidden until separate safety model |
