# Saved Chat Archive — Phase F.4.1 Package-Written Status Validator

Date: 2026-06-28

Status: **F.4.1 PACKAGE-WRITTEN STATUS VALIDATOR — PASSED**

Lane: Chat Saving Architecture (Phase F.4 — Chrome receipt/status semantics after
package materialization).

This slice adds a **static contract validator only** — no runtime implementation.
It locks the F.4 contract (`06ea40a`) and asserts the current runtime still
matches the pre-implementation state, so any future F.4.2/F.4.3 work that ships
the Desktop materialization sidecar or the Chrome read-back must consciously
update this validator.

## Baseline

```text
464d512  fix(studio): allow desktop dev archive materializer capabilities   (F.3)
06ea40a  docs(studio): define archive package-written status contract        (F.4 contract)
```

## Validator purpose

`tools/validation/studio/validate-saved-chat-archive-package-written-status-v1.mjs`
asserts, statically (reads source/doc text; no runtime, no DB, no network):

1. The F.4 contract evidence file exists and is marked **NOT IMPLEMENTED**.
2. The contract encodes the chosen decision (see below): "Archived" = captured;
   additive immutable-scan + sidecar receipt; the package-written vocabulary.
3. The **current** runtime still matches the pre-implementation state — no sidecar
   writer anywhere, no Chrome SQL/package/CAS authority, scanner enqueue-only,
   `queued-on-desktop` still renders "Archived".

It deliberately asserts that **no sidecar is implemented yet**; it is the gate that
F.4.2/F.4.3 must flip (the same pattern F.1→F.2 used for the trigger).

## F.4 decision summary (locked by this validator)

- **Keep Chrome "Archived" meaning "Desktop durably captured/accepted the
  request"** — `queued-on-desktop → archived` stays; do **not** relabel queued to
  "Queued on Desktop" as the primary badge. The `.h2ochat` package is a portable
  projection of the source-of-truth Desktop store, not the durability guarantee.
- **Add a future, optional, additive substate**
  `package-written → archived-package-written` (label **"Archived · package
  written"**), surfaced only when a Desktop materialization receipt is present.
- **Receipt model:** the scan receipt `receipts/<requestId>.receipt.json` stays
  the **immutable** enqueue verdict; the materialization projection is an
  **additive sidecar** `receipts/<requestId>.materialization.receipt.json`.
- **Chrome reads receipt files only** through the granted Archive Request Delivery
  folder — never Desktop SQLite, never the package/CAS body, never writes
  package/CAS/SQLite. **Desktop** owns the DB / materializer / package writer /
  Archive Health / (future) sidecar writer.

## Invariants asserted (15 checks: 6 `[F.4.1]` + 9 `[INVARIANT]`)

**Contract (`[F.4.1]`):**
- F.4 contract file exists.
- Contract is marked `F.4 CONTRACT — NOT IMPLEMENTED`.
- Contract defines `"Archived" = durably captured on Desktop` and that a written
  package is **not** required for "Archived".
- Contract defines the additive `materialization.receipt.json` sidecar.
- Contract keeps `<requestId>.receipt.json` as the **immutable** scan receipt.
- Contract defines the vocabulary: `package-written`, `archived-package-written`,
  `Archived · package written`, `queued-on-desktop`, `archived`.

**Current runtime boundaries (`[INVARIANT]`):**
- Status model still maps `queued-on-desktop → archived`, and does **not** yet
  implement `package-written` / `archived-package-written`.
- Chrome receipt reader reads `.receipt.json` files via the folder handle only —
  no `plugin:sql`, no native messaging, no `archive/packages` / `archive/assets` /
  `.h2ochat` body, no materializer/writer calls.
- Materializer writes **no** Chrome-visible receipt/sidecar yet (DB +
  `meta_json.materialization` only).
- Scanner stays enqueue-only (`materializeTriggered:false`, no auto-materialization).
- **No runtime file** under `src-surfaces-base/studio` writes the materialization
  sidecar (walked all `.js`, comment-stripped → zero references).
- No Chrome runtime SQL/package/CAS authority in reader / status model / badge.
- No polling/watcher/daemon in the status / read-back path.
- `S0F0j` / `S0F1j` do not wire the sidecar or package-written status.
- No webdav/cloud/sync/native-messaging/localhost relay in the F.4 status path.

## Current runtime status

**Sidecar is contract-only — NOT implemented.** The materializer updates the DB
row + `meta_json.materialization` (as proven in F.3) but writes no receipt; the
Chrome reader/status model/badge still resolve `queued-on-desktop → archived`. So
today the F.3 `written` package is visible to operators in Desktop Archive Health
but is **not** distinguished in the Chrome badge — exactly the F.4 contract's
"defined but deferred" position.

## Validation results

```text
node --check (new validator)                              syntax OK
validate-saved-chat-archive-package-written-status-v1.mjs PASS 15 checks
validate-saved-chat-archive-materializer-trigger-v1.mjs   PASS 24 checks
validate-saved-chat-archive-materializer-v1.mjs           all 14 checks passed
validate-saved-chat-archive-status-v1.mjs                 PASS 19 checks
validate-saved-chat-archive-status-badge-v1.mjs           PASS 30 checks
git diff --check / --cached --check                       clean
```

## Boundaries preserved

- **Validator/evidence only** — no sidecar writer, no Chrome reader/status/badge
  change, no materializer/scanner/writer change, no capability change.
- Chrome remains intent / read-back (files-only); Desktop remains authoritative.
- No Chrome runtime/service-worker touched; no sync/WebDAV/native messaging/
  localhost relay added; no polling/watcher/daemon.
- No `S0F0j` / `S0F1j` edits. No sync/appearance/ribbon dirty files touched. No
  unrelated files staged.

## Verdict

**F.4.1 PACKAGE-WRITTEN STATUS VALIDATOR — PASSED.** The F.4 contract is statically
locked and the current runtime provably matches the pre-implementation state: no
sidecar writer exists anywhere, Chrome retains no SQL/package/CAS authority, the
scanner stays enqueue-only, and `queued-on-desktop` still renders "Archived".

## Recommended next step after F.4.1

Proceed to **F.4.2** — the Desktop materialization **sidecar writer + one-shot
backfill/reconcile** for already-`written` rows (e.g. F.3's `f7cd514a-…`) —
**only if product confirms the Chrome-visible `package-written` distinction should
ship now**. Because materialization is still a manual operator action, the
distinction may instead remain Desktop-only in Archive Health; if so, leave F.4 at
"contract + validator" and revisit when/if materialization becomes
automatic/bulk. When F.4.2/F.4.3 do ship, this validator must be updated in lock-
step (flip the "no sidecar implemented" invariants to assert the bounded sidecar
writer + the additive `archived-package-written` read-back), mirroring the
F.1→F.2 gate flip.
